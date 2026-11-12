//! The streaming path: GOP splitting, ADTS framing, and the Session that puts
//! them together with the transcoder and the muxer.

mod support;

use std::collections::HashMap;

use mpeg2toh264::container::adts::AdtsStream;
use mpeg2toh264::mpeg2::constants::PictureType;
use mpeg2toh264::mpeg2::gop_stream::Mpeg2Gop;
use mpeg2toh264::mpeg2::gop_stream::Mpeg2GopStream;
use mpeg2toh264::mpeg2::headers::parse_elementary_stream;
use mpeg2toh264::{
    AudioGain, DualMono, Fragment, OpenGopRecovery, Progress, Session, TranscodeOptions, VideoMode,
};
use support::{
    adts_frame, adts_frame_with_payload, adts_stream, assert_decode_matches_passthrough, decoding,
    fragments_digest, init_segments, mux_programs, mux_transport_stream, mux_with_sound,
    non_intra_matrix_extension, passthrough_like_decode, picture_starts, read_fixture,
    track_samples, with_extension_in_pictures, wrap_mpeg2_es_in_ts, PesUnit, TrackSample,
    AUDIO_PID, FIXTURES, STREAM_TYPE_AAC_ADTS, STREAM_TYPE_MPEG2_VIDEO, VIDEO_PID,
};

/// Offset of the first `00 00 01 B8` group header.
fn first_gop_offset(data: &[u8]) -> usize {
    (0..data.len() - 3)
        .find(|&i| data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 && data[i + 3] == 0xb8)
        .expect("the fixture opens a group of pictures")
}

fn repeat_fixture(name: &str, copies: usize) -> Vec<u8> {
    let one = read_fixture(name);
    one.repeat(copies)
}

// ------------------------------------------------------------- GOP splitting

#[test]
fn splits_a_stream_into_one_unit_per_group() {
    let one = read_fixture("ibbp.m2v");
    let stream = one.repeat(3);
    let pictures_per_gop = parse_elementary_stream(&one).expect("parses").len();

    let mut splitter = Mpeg2GopStream::new();
    let mut units = Vec::new();
    // A chunk size that lines up with nothing, so boundaries fall mid-header.
    for chunk in stream.chunks(97) {
        units.extend(splitter.push(chunk, None));
    }
    units.extend(splitter.finish());

    assert_eq!(units.len(), 3, "one unit per group of pictures");
    for unit in &units {
        assert_eq!(
            parse_elementary_stream(&unit.data)
                .expect("unit parses")
                .len(),
            pictures_per_gop,
            "a unit holds exactly its own group"
        );
    }
}

#[test]
fn cuts_a_unit_where_the_description_changes_without_a_group_behind_it() {
    // A unit carries one description, and normally the change comes with a
    // group header the splitter would cut on anyway. This is the stream that
    // puts the new sequence header somewhere else: the cut has to follow it
    // there, or the unit's later pictures are coded at a size the parameter
    // sets in front of them do not describe.
    let one = read_fixture("ibbp.m2v");
    let other = read_fixture("hd1080i.m2v");
    let head = &other[..first_gop_offset(&other)];
    // The second picture of the first group, which is inside it and behind no
    // group header of its own.
    let at = (first_gop_offset(&one)..one.len() - 4)
        .filter(|&i| one[i] == 0 && one[i + 1] == 0 && one[i + 2] == 1 && one[i + 3] == 0)
        .nth(1)
        .expect("the group has a second picture");

    let mut stream = one[..at].to_vec();
    stream.extend_from_slice(head);
    stream.extend_from_slice(&one[at..]);
    // Something after it to cut the rest on.
    stream.extend_from_slice(&one);

    let mut splitter = Mpeg2GopStream::new();
    let mut units = splitter.push(&stream, None);
    units.extend(splitter.finish());

    assert_eq!(
        units[0].data.len(),
        at,
        "the first unit ends where the description changes"
    );
    for (index, unit) in units.iter().enumerate() {
        let sizes: Vec<(u32, u32)> = parse_elementary_stream(&unit.data)
            .expect("unit parses")
            .iter()
            .map(|picture| {
                (
                    picture.sequence.horizontal_size,
                    picture.sequence.vertical_size,
                )
            })
            .collect();
        assert!(
            sizes.windows(2).all(|pair| pair[0] == pair[1]),
            "unit {index} holds one frame size, not {sizes:?}"
        );
    }
}

#[test]
fn re_injects_the_sequence_header_a_later_unit_lacks() {
    // A broadcast repeats the sequence header, but a stream that carries it
    // only once still has to yield independently decodable units.
    let one = read_fixture("ibbp.m2v");
    let mut stream = one.clone();
    stream.extend_from_slice(&one[first_gop_offset(&one)..]);

    let mut splitter = Mpeg2GopStream::new();
    let mut units = splitter.push(&stream, None);
    units.extend(splitter.finish());

    assert_eq!(units.len(), 2);
    for (index, unit) in units.iter().enumerate() {
        assert_eq!(
            &unit.data[..4],
            &[0, 0, 1, 0xb3],
            "unit {index} opens with a sequence header"
        );
        assert!(!parse_elementary_stream(&unit.data)
            .expect("parses")
            .is_empty());
    }
}

#[test]
fn gives_each_unit_the_timestamp_of_the_packet_that_opens_it() {
    // The splitter drops everything before the first sequence header and
    // re-injects headers ahead of later units, so the byte a unit starts at is
    // not the byte it was handed. Getting that mapping wrong anchors the whole
    // presentation on the wrong picture.
    let one = read_fixture("ibbp.m2v");
    let mut splitter = Mpeg2GopStream::new();
    let mut units = Vec::new();
    for (index, chunk) in [one.as_slice(), one.as_slice(), one.as_slice()]
        .into_iter()
        .enumerate()
    {
        units.extend(splitter.push(chunk, Some(900_000 + index as u64 * 15_000)));
    }
    units.extend(splitter.finish());

    assert_eq!(
        units.iter().map(|unit| unit.pts).collect::<Vec<_>>(),
        vec![Some(900_000), Some(915_000), Some(930_000)],
    );
}

#[test]
fn gives_each_unit_its_transport_restart_position() {
    let one = read_fixture("ibbp.m2v");
    let mut splitter = Mpeg2GopStream::new();
    let mut units = Vec::new();
    for (index, chunk) in [one.as_slice(), one.as_slice(), one.as_slice()]
        .into_iter()
        .enumerate()
    {
        let restart = 9_500 + index as u64 * 1_000;
        units.extend(splitter.push_with_restart(
            chunk,
            Some(900_000 + index as u64 * 15_000),
            Some(restart),
        ));
    }
    units.extend(splitter.finish());

    assert_eq!(
        units
            .iter()
            .map(|unit| unit.restart_offset)
            .collect::<Vec<_>>(),
        vec![Some(9_500), Some(10_500), Some(11_500)],
    );
}

#[test]
fn restart_only_mark_does_not_hide_the_previous_timestamp() {
    let one = read_fixture("ibbp.m2v");
    let mut splitter = Mpeg2GopStream::new();
    let mut units = Vec::new();
    units.extend(splitter.push_with_restart(&one, Some(900_000), Some(9_500)));
    units.extend(splitter.push_with_restart(&one, None, Some(10_500)));
    units.extend(splitter.push_with_restart(&one, Some(930_000), Some(11_500)));
    units.extend(splitter.finish());

    assert_eq!(units.len(), 3);
    assert_eq!(units[1].pts, Some(900_000));
    assert_eq!(units[1].restart_offset, Some(10_500));
}

#[test]
fn transport_discontinuity_discards_both_pending_marks() {
    let one = read_fixture("ibbp.m2v");
    let mut splitter = Mpeg2GopStream::new();
    assert!(splitter
        .push_with_restart(&one, Some(900_000), Some(9_500))
        .is_empty());
    splitter.discard_pending();

    let mut units = splitter.push_with_restart(&one, None, None);
    units.extend(splitter.finish());

    assert_eq!(units.len(), 1);
    assert_eq!(units[0].pts, None);
    assert_eq!(units[0].restart_offset, None);
}

#[test]
fn holds_an_unfinished_group_back() {
    let one = read_fixture("ibbp.m2v");
    let mut splitter = Mpeg2GopStream::new();
    // One whole group is not enough: the splitter cannot know it has ended
    // until the next one starts.
    assert!(splitter.push(&one, None).is_empty());
    assert_eq!(splitter.finish().len(), 1, "and it comes out at the end");
}

// --------------------------------------------------------------- ADTS framing

fn packed_bits(bits: &str) -> Vec<u8> {
    let mut out = vec![0; bits.len().div_ceil(8)];
    for (at, value) in bits.bytes().enumerate() {
        if value == b'1' {
            out[at / 8] |= 1 << (7 - at % 8);
        }
    }
    out
}

#[test]
fn strips_adts_headers_without_touching_the_payload() {
    let expected: Vec<Vec<u8>> = (0..4)
        .map(|i| {
            let frame = adts_frame(3, 2, 32 + i);
            frame[7..].to_vec()
        })
        .collect();
    let stream: Vec<u8> = (0..4).flat_map(|i| adts_frame(3, 2, 32 + i)).collect();

    let mut adts = AdtsStream::new();
    let mut frames = adts.push(&stream).expect("frames decode");
    frames.extend(adts.finish().expect("nothing is left over"));

    assert_eq!(frames.len(), 4);
    for (frame, payload) in frames.iter().zip(&expected) {
        assert_eq!(&frame.data, payload);
    }
}

/// A broadcast mono or dual-mono service sends neither a channel
/// configuration in the header nor a program_config_element to carry one: what
/// the service is lives in the PMT. A stream opened part way through, as one
/// resumed at a seek is, has only the element to go on.
#[test]
fn takes_a_single_channel_element_with_no_channel_configuration() {
    // The empty SCE of the mono case, with the header saying nothing.
    let frame = adts_frame_with_payload(3, 0, &[0, 0, 0, 7]);
    let frames = AdtsStream::new().push(&frame).expect("frame decodes");
    let config = &frames[0].config;
    // Every single-element service comes out as a stereo pair, so the track
    // keeps one configuration however the broadcast switches about.
    assert_eq!(config.channel_count, 2);
    assert_eq!(config.audio_specific_config, [0x11, 0x90]);
    assert_eq!(frames[0].data[0] >> 5, 1, "SCE became a CPE");
}

/// An `individual_channel_stream` carrying no spectral data, whose global gain
/// says which service it belongs to: eight bits of gain, an `ics_info` with a
/// long window and `max_sfb` 0, and the three absent-tool flags.
fn empty_ics(global_gain: u8) -> String {
    format!("{global_gain:08b}{}", "0".repeat(14))
}

/// ARIB carries a bilingual programme as two single channel elements in one
/// stream rather than as two streams of its own, and a receiver plays one of
/// them on both speakers. Which one is the viewer's choice. Both are rebuilt
/// into the same two-channel configuration, so unlike moving to another
/// elementary stream the change describes nothing anew.
#[test]
fn takes_either_service_of_a_dual_mono_stream() {
    let dual_mono = packed_bits(&format!(
        "000{tag_main}{main}000{tag_sub}{sub}111",
        tag_main = "0000",
        main = empty_ics(0xa5),
        tag_sub = "0001",
        sub = empty_ics(0x5a),
    ));
    let frame = adts_frame_with_payload(3, 0, &dual_mono);
    // A channel pair built from one of them, twice: the element instance tag
    // stays the one the two-channel configuration names whichever is taken.
    let rebuilt = |gain| packed_bits(&format!("00100000{ics}{ics}111", ics = empty_ics(gain)));

    let mut main = AdtsStream::new();
    let played = main.push(&frame).expect("the main service decodes");
    assert_eq!(played[0].data, rebuilt(0xa5));
    assert_eq!(played[0].config.channel_count, 2);
    assert!(
        main.is_dual_mono(),
        "the stream says it has a second service in it, which the ADTS header \
         of a mono stream does not"
    );

    let mut sub = AdtsStream::new();
    sub.select_dual_mono(DualMono::Sub);
    let played = sub.push(&frame).expect("the second service decodes");
    assert_eq!(played[0].data, rebuilt(0x5a));
    assert_eq!(
        played[0].config,
        AdtsStream::new().push(&frame).expect("decodes")[0].config,
        "the two services are described identically, so nothing is redescribed"
    );

    // A stream with one service in it has nothing else to play, and asking for
    // the second leaves it as it was.
    let mono = adts_frame_with_payload(
        3,
        0,
        &packed_bits(&format!("0000000{}111", empty_ics(0x33))),
    );
    let mut asked = AdtsStream::new();
    asked.select_dual_mono(DualMono::Sub);
    let played = asked.push(&mono).expect("the mono service decodes");
    assert_eq!(played[0].data, rebuilt(0x33));
    assert!(!asked.is_dual_mono());
}

#[test]
fn takes_a_channel_pair_with_no_channel_configuration() {
    let mut frame = adts_frame(3, 0, 16);
    frame[7] = 0x20; // id_syn_ele=CPE
    let frames = AdtsStream::new().push(&frame).expect("frame decodes");
    assert_eq!(frames[0].config.channel_count, 2);
    assert_eq!(frames[0].config.audio_specific_config, [0x11, 0x90]);
}

/// Raising the sound is a change to each channel's `global_gain` and to no other
/// bit. The step is picked by what the listener gets: a mono service is a stereo
/// pair by the time it is handed out, and 5.1 is counted apart.
#[test]
fn raises_every_channels_global_gain_by_the_steps_asked_for() {
    let gain = AudioGain {
        stereo: 4,
        surround: 3,
    };
    let raised = |frame: &[u8]| {
        let mut stream = AdtsStream::new();
        stream.set_audio_gain(gain);
        stream
            .push(frame)
            .expect("the frame decodes")
            .remove(0)
            .data
    };

    let stereo =
        |a: u8, b: u8| packed_bits(&format!("00100000{}{}111", empty_ics(a), empty_ics(b)));
    assert_eq!(
        raised(&adts_frame_with_payload(3, 2, &stereo(100, 120))),
        stereo(104, 124)
    );

    let mono = packed_bits(&format!("0000000{}111", empty_ics(150)));
    assert_eq!(
        raised(&adts_frame_with_payload(3, 0, &mono)),
        stereo(154, 154),
        "both copies of the rebuilt pair are raised, by the stereo step"
    );

    let surround = |g: u8| {
        let ics = empty_ics(g);
        packed_bits(
            &format!("0000000{ics}0010000 0{ics}{ics}0010001 0{ics}{ics}0110000{ics}111")
                .replace(' ', ""),
        )
    };
    assert_eq!(
        raised(&adts_frame_with_payload(3, 6, &surround(90))),
        surround(93)
    );

    // A step that would take a gain past eight bits is a frame no decoder
    // reads, so that frame keeps its own level.
    assert_eq!(
        raised(&adts_frame_with_payload(3, 2, &stereo(100, 253))),
        stereo(100, 253)
    );
}

/// Packet loss leaves a recording with the odd unreadable access unit, and one
/// handed to a decoder is not a frame it skips -- it is an error that stops the
/// stream. A frame whose elements cannot be walked, or which names elements the
/// stream has not been carrying, is dropped the way a damaged picture is.
#[test]
fn drops_a_frame_packet_loss_made_unreadable() {
    // Two 5.1 frames the walker can read, then one whose second element is not
    // there at all, then another good one.
    let good = adts_frame_with_payload(3, 6, &five_point_one_payload(0));
    let damaged = adts_frame_with_payload(3, 6, &packed_bits("000 0000 111"));
    let mut stream = good.clone();
    stream.extend_from_slice(&good);
    stream.extend_from_slice(&damaged);
    stream.extend_from_slice(&good);

    let mut adts = AdtsStream::new();
    let mut frames = adts.push(&stream).expect("the readable frames decode");
    frames.extend(adts.finish().expect("nothing is left over"));
    assert_eq!(frames.len(), 3, "the damaged frame is not passed on");
}

#[test]
fn a_transport_discontinuity_does_not_join_two_aac_frames() {
    // A continuity hole can cut one ADTS access unit between PES packets. The
    // next PES starts with a complete frame, and joining its bytes to the old
    // prefix creates a structurally plausible frame that a browser refuses.
    // Discarding the parser's pending prefix makes the complete replacement
    // frame the next unit handed to the decoder.
    let frame = adts_frame_with_payload(3, 6, &five_point_one_payload(0));
    let split = frame.len() / 2;
    let mut adts = AdtsStream::new();
    assert!(adts
        .push(&frame[..split])
        .expect("a partial frame is held")
        .is_empty());

    adts.discard_pending();
    let frames = adts
        .push(&frame)
        .expect("the complete frame after the hole decodes");
    assert_eq!(frames.len(), 1);
}

/// What a hole in the sound is filled with. Every channel the configuration
/// names carries a long window with no scalefactor bands, which is no spectral
/// data at all: the shortest access unit a decoder will accept for that
/// configuration, and digital silence when it decodes it.
#[test]
fn builds_silence_a_decoder_can_read_for_each_configuration() {
    use mpeg2toh264::container::adts::silent_frame;

    for channels in [2u8, 6] {
        let config = AdtsStream::new()
            .push(&adts_frame(3, channels, 16))
            .expect("a frame of this configuration")[0]
            .config
            .clone();
        let silence = silent_frame(&config).expect("a layout with a name");
        assert_eq!(silence.config, config);

        // Read back the way the stream's own frames are, so that what is
        // handed on is something this walker calls whole.
        let mut framed = adts_frame(3, channels, silence.data.len());
        framed[7..].copy_from_slice(&silence.data);
        let read = AdtsStream::new().push(&framed).expect("silence decodes");
        assert_eq!(read.len(), 1, "{channels} channels");
        assert_eq!(read[0].data, silence.data);
        assert_eq!(read[0].config.channel_count, channels);
    }
}

/// A programme in 5.1 followed by an announcement in stereo is one stream that
/// changes what it is, not a damaged one. The header says so, and the elements
/// change with it, so the run of frames the walker was reading ends there.
#[test]
fn reads_past_a_change_of_configuration() {
    let mut stream = adts_stream(2, 3, 2);
    stream.extend_from_slice(&adts_frame_with_payload(3, 6, &five_point_one_payload(0)));
    stream.extend_from_slice(&adts_frame_with_payload(3, 6, &five_point_one_payload(0)));

    let mut adts = AdtsStream::new();
    let mut frames = adts.push(&stream).expect("both configurations decode");
    frames.extend(adts.finish().expect("nothing is left over"));

    assert_eq!(frames.len(), 4, "no frame is dropped at the change");
    assert_eq!(frames[0].config.channel_count, 2);
    assert_eq!(frames[0].config.audio_specific_config, [0x11, 0x90]);
    assert_eq!(frames[3].config.channel_count, 6);
    assert_eq!(
        frames[3].config.audio_specific_config,
        [0x11, 0xb0],
        "and each frame carries the configuration it was coded under"
    );
}

/// A frame that walks but names an element the stream has not carried is
/// damage as well: a decoder has room only for the elements its configuration
/// named, and refuses the frame that mentions another.
#[test]
fn drops_a_frame_whose_elements_are_not_the_streams() {
    let good = adts_frame_with_payload(3, 6, &five_point_one_payload(0));
    let renamed = adts_frame_with_payload(3, 6, &five_point_one_payload(12));
    let mut stream = good.clone();
    stream.extend_from_slice(&renamed);
    stream.extend_from_slice(&good);

    let mut adts = AdtsStream::new();
    let mut frames = adts.push(&stream).expect("decodes");
    frames.extend(adts.finish().expect("nothing is left over"));
    assert_eq!(frames.len(), 2, "the frame with a stray element tag goes");
}

/// An empty 5.1 raw_data_block: a centre SCE, a front pair, a back pair and an
/// LFE, every one of them carrying no spectral data. `tag` names the first
/// element, so that a frame can be made to disagree with its neighbours.
fn five_point_one_payload(tag: u8) -> Vec<u8> {
    // global_gain, then an ics_info with a long window and max_sfb 0, then the
    // three absent-tool flags. Twenty-two zeroes, and no spectral data at all.
    let empty_ics = "0".repeat(22);
    let mut bits = String::new();
    bits.push_str("000"); // ID_SCE
    bits.push_str(&format!("{:04b}", tag));
    bits.push_str(&empty_ics);
    for pair in 0..2 {
        bits.push_str("001"); // ID_CPE
        bits.push_str(&format!("{:04b}", pair));
        bits.push('0'); // common_window: each channel carries its own ics_info
        bits.push_str(&empty_ics);
        bits.push_str(&empty_ics);
    }
    bits.push_str("011"); // ID_LFE
    bits.push_str("0000");
    bits.push_str(&empty_ics);
    bits.push_str("111"); // ID_END
    packed_bits(&bits.replace(' ', ""))
}

/// A seek opens the stream inside a frame, and the spectral data before the
/// first header holds the occasional run of twelve set bits that reads as a
/// syncword: one seek in forty over a broadcast recording lands on one. The
/// header it makes up says the sound is something else -- object type 1 or 4
/// rather than AAC-LC -- or names an element no raw_data_block starts with, and
/// the conversion used to stop there rather than at the frame it was really in.
#[test]
fn steps_over_a_syncword_the_spectral_data_made() {
    // The tail of the frame the seek landed inside: a syncword whose header
    // says object type 1, and whose frame length points at nothing.
    let false_header = [0xff, 0xf0, 0x00, 0x1f, 0xff, 0xe0, 0xfc, 0x00];
    for cut in 0..false_header.len() {
        let mut stream = false_header[cut..].to_vec();
        stream.extend_from_slice(&adts_stream(4, 3, 2));

        let mut adts = AdtsStream::new();
        let mut frames = adts.push(&stream).expect("the frames after it decode");
        frames.extend(adts.finish().expect("nothing is left over"));
        assert_eq!(frames.len(), 4, "cut {cut}");
    }
}

/// Stepping over a header the spectral data made is not stepping over a header:
/// the frames of a stream that is not AAC-LC follow one another the way any
/// stream's do, so what they say about themselves is read rather than skipped.
#[test]
fn refuses_a_run_of_frames_that_are_not_aac_lc() {
    let mut frame = adts_frame(3, 2, 32);
    frame[2] = (frame[2] & 0x3f) | 0x80; // profile 2, i.e. AAC SSR
    let stream: Vec<u8> = std::iter::repeat_n(frame, 4).flatten().collect();

    let error = AdtsStream::new()
        .push(&stream)
        .expect_err("the stream is refused");
    assert!(error.to_string().contains("audio object type 3"), "{error}");
}

#[test]
fn reassembles_frames_split_across_chunks() {
    let stream = adts_stream(8, 3, 2);
    let mut adts = AdtsStream::new();
    let mut frames = Vec::new();
    for chunk in stream.chunks(7) {
        frames.extend(adts.push(chunk).expect("frames decode"));
    }
    frames.extend(adts.finish().expect("nothing is left over"));
    assert_eq!(frames.len(), 8);
}

#[test]
fn derives_the_audio_specific_config_from_the_header() {
    // 48 kHz stereo: object type 2, frequency index 3, channel configuration 2.
    let mut adts = AdtsStream::new();
    let mut frame = adts_frame(3, 2, 16);
    frame[7] = 0x20; // id_syn_ele=CPE
    let frames = adts.push(&frame).expect("frame decodes");
    let config = &frames[0].config;
    assert_eq!(config.audio_object_type, 2);
    assert_eq!(config.sample_rate, 48_000);
    assert_eq!(config.channel_count, 2);
    assert_eq!(config.audio_specific_config, [0x11, 0x90]);
}

#[test]
fn maps_mono_sce_to_primary_audio_on_both_stereo_channels() {
    // max_sfb=0 gives a valid empty ICS: SCE/tag 0, global_gain, ics_info,
    // three absent-tool flags, END and byte alignment.
    let frame = adts_frame_with_payload(3, 1, &[0, 0, 0, 7]);
    let frames = AdtsStream::new().push(&frame).expect("mono frame decodes");
    let config = &frames[0].config;
    assert_eq!(config.channel_count, 2);
    assert_eq!(config.audio_specific_config, [0x11, 0x90]);
    assert_eq!(frames[0].data[0] >> 5, 1, "SCE became a CPE");
}

/// A frame the encoder padded to a byte, rewritten, must not end up padded
/// twice: a decoder that measures the block against the bytes it consumed
/// rejects a frame with a whole byte hanging off the end, which is what a mono
/// service sounded like on a Media Foundation decoder -- about half its frames
/// went missing.
#[test]
fn the_rewrite_ends_the_block_at_id_end() {
    // The empty SCE and ID_END of the mono case, then a byte of padding.
    let frame = adts_frame_with_payload(3, 1, &[0, 0, 0, 7, 0]);
    let frames = AdtsStream::new()
        .push(&frame)
        .expect("padded frame decodes");
    // ID_CPE, tag, common_window, two 22-bit channel streams and ID_END: 55
    // bits, which is seven bytes once aligned. Carrying the input's tail
    // across would make it eight.
    assert_eq!(frames[0].data.len(), 7);
}

/// A fill element's escape form spans `count + esc_count - 1` bytes, and
/// `count` is 15 to have reached it, so `esc_count` 0 is fourteen bytes.
/// Fourteen is the one length both forms can write, so an encoder that writes
/// it the long way is rare -- and reading it as fifteen walks the element a byte
/// past the end of the block it is in, which loses the frame and with it the
/// stream. A news recording ran forty seconds before hitting one.
#[test]
fn reads_a_fill_element_written_with_an_escape_count_of_zero() {
    // The empty SCE of the mono case, then a fill element written as count 15
    // with esc_count 0, its fourteen bytes of payload, ID_END and alignment.
    let mut payload = vec![0x00, 0x00, 0x00, 0x06, 0xf0];
    payload.extend_from_slice(&[0x00; 14]);
    payload.push(0x0e);
    let frame = adts_frame_with_payload(3, 1, &payload);
    let frames = AdtsStream::new()
        .push(&frame)
        .expect("the fill element is fourteen bytes, not fifteen");
    assert_eq!(frames[0].data[0] >> 5, 1, "SCE became a CPE");
    // ID_CPE, tag, common_window, two 22-bit channel streams, and the 130 bits
    // from the fill element to one past ID_END: 182 bits, or 23 bytes aligned.
    assert_eq!(
        frames[0].data.len(),
        23,
        "the fill element is carried across"
    );
}

#[test]
fn accepts_mono_to_dual_mono_changes_when_the_primary_sce_is_stable() {
    let mono = adts_frame_with_payload(3, 1, &[0, 0, 0, 7]);
    // Two empty SCEs (tags 0 and 1) followed by END.
    let dual = adts_frame_with_payload(3, 2, &[0, 0, 0, 0, 0x10, 0, 0, 0x38]);
    let mut adts = AdtsStream::new();
    let first = adts.push(&mono).expect("mono frame");
    let second = adts.push(&dual).expect("dual-mono frame");
    assert_eq!(first[0].config, second[0].config);
    assert_eq!(second[0].config.channel_count, 2);
    assert_eq!(second[0].data.len(), 7, "the secondary SCE is discarded");
    for bit in 0..22 {
        let left = (second[0].data[(8 + bit) / 8] >> (7 - ((8 + bit) & 7))) & 1;
        let right = (second[0].data[(30 + bit) / 8] >> (7 - ((30 + bit) & 7))) & 1;
        assert_eq!(left, right, "ICS bit {bit} is duplicated");
    }
}

#[test]
fn accepts_stereo_to_zero_config_dual_mono_changes() {
    let mut stereo = adts_frame(3, 2, 16);
    stereo[7] = 0x20; // ID_CPE
                      // Two empty SCEs while channel_configuration is zero, as ARIB dual mono
                      // signals itself after an ordinary stereo programme.
    let dual = adts_frame_with_payload(3, 0, &[0, 0, 0, 0, 0x10, 0, 0, 0x38]);
    let mut adts = AdtsStream::new();
    assert_eq!(adts.push(&stereo).expect("stereo frame").len(), 1);
    let frames = adts.push(&dual).expect("dual-mono frame");

    assert_eq!(
        frames.len(),
        1,
        "the configuration change is not packet damage"
    );
    assert_eq!(frames[0].config.channel_count, 2);
    assert_eq!(frames[0].data.len(), 7, "the primary SCE is duplicated");
}

#[test]
fn reads_an_in_band_pce_when_adts_channel_configuration_is_zero() {
    let payload = packed_bits(concat!(
        "101", // ID_PCE
        "0000",
        "01",
        "0011", // tag, AAC-LC, 48 kHz
        "0001",
        "0000",
        "0000",
        "00",
        "000",
        "0000", // element counts
        "0",
        "0",
        "0", // no mixdown metadata
        "0",
        "0000",                          // one front SCE, tag 0
        "000000",                        // byte alignment
        "00000000",                      // no PCE comment
        "00000000000000000000000000000", // empty SCE/tag 0 and ICS
        "111",                           // ID_END
    ));
    let frame = adts_frame_with_payload(3, 0, &payload);
    let frames = AdtsStream::new().push(&frame).expect("PCE frame decodes");
    assert_eq!(frames[0].config.channel_count, 2);
    assert_eq!(frames[0].config.audio_specific_config, [0x11, 0x90]);
    assert_eq!(frames[0].data[0] >> 5, 1, "the PCE/SCE became a CPE");
}

#[test]
fn preserves_an_implicit_five_point_one_configuration() {
    let frame = adts_frame(3, 6, 16);
    let expected = frame[7..].to_vec();
    let frames = AdtsStream::new().push(&frame).expect("5.1 frame decodes");
    assert_eq!(frames[0].config.channel_count, 6);
    assert_eq!(frames[0].config.audio_specific_config, [0x11, 0xb0]);
    assert_eq!(frames[0].data, expected, "5.1 payload passes through");
}

#[test]
fn moves_an_explicit_five_point_one_pce_into_the_asc() {
    let payload = packed_bits(concat!(
        "101", // ID_PCE
        "0000",
        "01",
        "0011", // tag, AAC-LC, 48 kHz
        "0010",
        "0000",
        "0001",
        "01",
        "000",
        "0000", // 2 front, 1 back, 1 LFE
        "0",
        "0",
        "0", // no mixdown metadata
        "0",
        "0000", // front centre SCE 0
        "1",
        "0000", // front left/right CPE 0
        "1",
        "0001",                          // back left/right CPE 1
        "0000",                          // LFE tag 0
        "00000000",                      // no PCE comment (already byte aligned)
        "00000000000000000000000000000", // first SCE; rest is opaque here
        "111",                           // ID_END
    ));
    let frame = adts_frame_with_payload(3, 0, &payload);
    let frames = AdtsStream::new()
        .push(&frame)
        .expect("PCE 5.1 frame decodes");
    assert_eq!(frames[0].config.channel_count, 6);
    assert_eq!(&frames[0].config.audio_specific_config[..2], &[0x11, 0x80]);
    assert!(frames[0].config.audio_specific_config.len() > 2);
    assert_eq!(
        frames[0].data, payload,
        "multichannel payload passes through"
    );
}

#[test]
fn rejects_audio_that_is_not_aac_lc() {
    // The audio is carried through without being decoded, so anything but the
    // profile the muxer will claim in its esds has to be refused up front.
    let mut frame = adts_frame(3, 2, 16);
    frame[2] &= 0x3f; // profile 0, i.e. AAC Main
    let error = AdtsStream::new().push(&frame).expect_err("must fail");
    assert!(error.to_string().contains("audio object type 1"), "{error}");
}

#[test]
fn drops_a_truncated_final_frame() {
    // A recording that stops mid-frame ends with part of an access unit. There
    // is nothing to hand a decoder there, and the frames before it are still
    // good, so the remainder is dropped rather than failing the stream.
    let stream = adts_stream(2, 3, 2);
    let mut adts = AdtsStream::new();
    let frames = adts
        .push(&stream[..stream.len() - 4])
        .expect("frames decode");
    assert_eq!(frames.len(), 1, "the frame that did arrive whole");
    assert!(adts
        .finish()
        .expect("the partial frame is dropped")
        .is_empty());
}

// ------------------------------------------------------------------- Session

fn video_only_stream(copies: usize) -> Vec<u8> {
    video_stream_from_fixture("ibbp.m2v", copies)
}

fn video_stream_from_fixture(name: &str, copies: usize) -> Vec<u8> {
    let es = repeat_fixture(name, copies);
    let units: Vec<PesUnit<'_>> = es
        .chunks(20_000)
        .enumerate()
        .map(|(index, payload)| PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload,
            pts: Some(900_000 + index as u64 * 3_000),
        })
        .collect();
    mux_transport_stream(
        &[(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)],
        &units,
        &mut HashMap::new(),
    )
}

/// A stream with both tracks, interleaved the way a broadcast would send them,
/// and with the audio starting slightly later than the video.
fn av_stream(copies: usize, audio_frames: usize) -> Vec<u8> {
    let video = repeat_fixture("ibbp.m2v", copies);
    let audio = adts_stream(audio_frames, 3, 2);
    let video_chunks: Vec<&[u8]> = video.chunks(20_000).collect();
    let audio_chunks: Vec<&[u8]> = audio.chunks(400).collect();

    let mut units: Vec<PesUnit<'_>> = Vec::new();
    for index in 0..video_chunks.len().max(audio_chunks.len()) {
        if let Some(payload) = video_chunks.get(index) {
            units.push(PesUnit {
                pid: VIDEO_PID,
                stream_id: 0xe0,
                payload,
                pts: Some(900_000 + index as u64 * 3_000),
            });
        }
        if let Some(payload) = audio_chunks.get(index) {
            units.push(PesUnit {
                pid: AUDIO_PID,
                stream_id: 0xc0,
                payload,
                pts: Some(903_600 + index as u64 * 3_000),
            });
        }
    }
    mux_transport_stream(
        &[
            (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
            (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        ],
        &units,
        &mut HashMap::new(),
    )
}

/// Both tracks, with the sound changing configuration part way through, which
/// is what a broadcast does between a programme in 5.1 and the announcement in
/// stereo after it.
fn audio_change_stream(copies: usize, before: usize, after: usize) -> Vec<u8> {
    let video = repeat_fixture("ibbp.m2v", copies);
    let mut audio = adts_stream(before, 3, 2);
    for _ in 0..after {
        audio.extend_from_slice(&adts_frame_with_payload(3, 6, &five_point_one_payload(0)));
    }
    let video_chunks: Vec<&[u8]> = video.chunks(20_000).collect();
    let audio_chunks: Vec<&[u8]> = audio.chunks(400).collect();

    let mut units: Vec<PesUnit<'_>> = Vec::new();
    for index in 0..video_chunks.len().max(audio_chunks.len()) {
        if let Some(payload) = video_chunks.get(index) {
            units.push(PesUnit {
                pid: VIDEO_PID,
                stream_id: 0xe0,
                payload,
                pts: Some(900_000 + index as u64 * 3_000),
            });
        }
        if let Some(payload) = audio_chunks.get(index) {
            units.push(PesUnit {
                pid: AUDIO_PID,
                stream_id: 0xc0,
                payload,
                pts: Some(903_600 + index as u64 * 3_000),
            });
        }
    }
    let mut continuity = HashMap::new();
    mux_transport_stream(
        &[
            (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
            (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        ],
        &units,
        &mut continuity,
    )
}

/// Both tracks with the timestamps the source would really carry: one PES per
/// group of pictures, and the sound running alongside it access unit by access
/// unit. `av_stream` times its PES by where the bytes fell rather than by where
/// the pictures play, which is enough for pairing the two tracks but says
/// nothing about a hole -- and a hole is a hole in the timestamps.
fn timed_av_stream(copies: usize) -> Vec<u8> {
    timed_av_stream_from(copies, 900_000)
}

/// The same, opening at a timestamp of the caller's choosing, so that a run of
/// it can be made to cross the wrap.
fn timed_av_stream_from(copies: usize, base: u64) -> Vec<u8> {
    let one = read_fixture("ibbp.m2v");
    let pictures = parse_elementary_stream(&one).expect("parses").len() as u64;
    // The fixture is 25 fps, and 48 kHz AAC access units are 1024 samples.
    const FRAME: u64 = 90_000 / 25;
    const AAC: u64 = 1024 * 90_000 / 48_000;
    let group = pictures * FRAME;
    let audio = adts_stream(1, 3, 2);

    let mut audio_frames = 0u64;
    let mut payloads: Vec<Vec<u8>> = Vec::new();
    let mut units: Vec<(u16, u8, usize, u64)> = Vec::new();
    for copy in 0..copies as u64 {
        payloads.push(one.clone());
        let modulus = 1u64 << 33;
        units.push((
            VIDEO_PID,
            0xe0,
            payloads.len() - 1,
            (base + copy * group) % modulus,
        ));
        let through = (copy + 1) * group / AAC;
        let mut block = Vec::new();
        let first = audio_frames;
        while audio_frames < through {
            block.extend_from_slice(&audio);
            audio_frames += 1;
        }
        if !block.is_empty() {
            payloads.push(block);
            units.push((
                AUDIO_PID,
                0xc0,
                payloads.len() - 1,
                (base + first * AAC) % modulus,
            ));
        }
    }
    let units: Vec<PesUnit<'_>> = units
        .iter()
        .map(|&(pid, stream_id, payload, pts)| PesUnit {
            pid,
            stream_id,
            payload: &payloads[payload],
            pts: Some(pts),
        })
        .collect();
    mux_transport_stream(
        &[
            (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
            (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        ],
        &units,
        &mut HashMap::new(),
    )
}

/// The same transport stream with a stretch of packets missing, which is what
/// a recording made through a failing signal has in it.
fn with_packets_dropped(stream: &[u8], from: usize, count: usize) -> Vec<u8> {
    stream
        .chunks(188)
        .enumerate()
        .filter(|(index, _)| !(from..from + count).contains(index))
        .flat_map(|(_, packet)| packet.iter().copied())
        .collect()
}

fn run_session(stream: &[u8], chunk_size: usize) -> Vec<Fragment> {
    run_session_with_options(stream, chunk_size, TranscodeOptions::default())
}

fn run_session_with_options(
    stream: &[u8],
    chunk_size: usize,
    options: TranscodeOptions,
) -> Vec<Fragment> {
    let mut session = Session::new(options);
    let mut fragments = Vec::new();
    for chunk in stream.chunks(chunk_size) {
        fragments.extend(session.push(chunk).expect("push succeeds"));
    }
    fragments.extend(session.finish().expect("finish succeeds"));
    fragments
}

/// How many video PES packets had begun when the first media fragment came
/// out, feeding one transport packet at a time.
fn video_packets_begun_before_the_first_fragment(stream: &[u8]) -> usize {
    let mut session = Session::new(TranscodeOptions::default());
    let mut begun = 0;
    for packet in stream.chunks(188) {
        let pid = u16::from(packet[1] & 0x1f) << 8 | u16::from(packet[2]);
        if pid == VIDEO_PID && packet[1] & 0x40 != 0 {
            begun += 1;
        }
        let fragments = session.push(packet).expect("push succeeds");
        if fragments
            .iter()
            .any(|fragment| matches!(fragment, Fragment::Media { .. }))
        {
            return begun;
        }
    }
    panic!("no media fragment came out");
}

#[test]
fn a_group_goes_out_without_waiting_for_the_one_after_it() {
    // Each video PES here is one whole group, followed by the sound that
    // belongs beside it. The first group is known to be complete when the
    // second one's header arrives, and its sound is in by then, so nothing
    // of the third is needed.
    let stream = timed_av_stream(4);
    assert_eq!(video_packets_begun_before_the_first_fragment(&stream), 3);
}

fn split_fragments(fragments: &[Fragment]) -> (Vec<&Fragment>, Vec<&Fragment>) {
    fragments
        .iter()
        .partition(|f| matches!(f, Fragment::Init { .. }))
}

#[test]
fn emits_one_initialization_segment_then_media() {
    let fragments = run_session(&video_only_stream(3), 64 * 1024);
    let (init, media) = split_fragments(&fragments);

    assert_eq!(init.len(), 1, "MSE needs the init segment exactly once");
    let Fragment::Init {
        data,
        mime_codec,
        width,
        height,
    } = init[0]
    else {
        unreachable!()
    };
    assert_eq!(&data[4..8], b"ftyp");
    assert!(data.windows(4).any(|w| w == b"moov"));
    assert!(
        mime_codec.starts_with("video/mp4; codecs=\"avc1."),
        "{mime_codec}"
    );
    assert!(!mime_codec.contains("mp4a"), "no audio track was declared");
    let pictures = parse_elementary_stream(&read_fixture("ibbp.m2v")).expect("fixture parses");
    assert_eq!(
        (*width, *height),
        (
            pictures[0].sequence.horizontal_size,
            pictures[0].sequence.vertical_size
        )
    );

    assert_eq!(media.len(), 3, "one fragment per group of pictures");
    assert!(
        matches!(fragments[0], Fragment::Init { .. }),
        "the init segment comes first"
    );
    for fragment in &media {
        let Fragment::Media { data, .. } = fragment else {
            unreachable!()
        };
        assert_eq!(&data[4..8], b"moof");
        assert!(data.windows(4).any(|w| w == b"mdat"));
    }
}

#[test]
fn carries_each_gops_transport_restart_position_to_its_fragment() {
    let stream = video_only_stream(3);
    let fragments = run_session(&stream, 197);
    let restarts: Vec<_> = fragments
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Media { restart_offset, .. } => Some(*restart_offset),
            _ => None,
        })
        .collect();

    assert_eq!(restarts, vec![Some(0); 3]);
}

#[test]
fn fragments_advance_along_one_timeline() {
    let fragments = run_session(&video_only_stream(4), 64 * 1024);
    let (_, media) = split_fragments(&fragments);

    let mut previous = -1.0f64;
    for (index, fragment) in media.iter().enumerate() {
        let Fragment::Media {
            start,
            random_access,
            video_samples,
            ..
        } = fragment
        else {
            unreachable!()
        };
        assert!(
            *start > previous,
            "fragment {index} starts at {start}, after {previous}"
        );
        previous = *start;
        assert!(*video_samples > 0);
        assert_eq!(
            *random_access,
            index == 0,
            "only the opening fragment restarts the decoder, this far in"
        );
    }
}

/// The payload of the first box of this type, at any depth.
fn find_box<'a>(data: &'a [u8], want: &[u8; 4]) -> Option<&'a [u8]> {
    let mut at = 0;
    while at + 8 <= data.len() {
        let size = u32::from_be_bytes(data[at..at + 4].try_into().ok()?) as usize;
        if size < 8 || at + size > data.len() {
            return None;
        }
        let body = &data[at + 8..at + size];
        if &data[at + 4..at + 8] == want {
            return Some(body);
        }
        if let Some(found) = find_box(body, want) {
            return Some(found);
        }
        at += size;
    }
    None
}

/// Where a fragment's video track begins in decode time and where its samples
/// carry it to. The video `traf` is the first in the `moof`, and its `trun`
/// gives every sample a duration of its own.
fn video_decode_span(media: &[u8]) -> (u64, u64) {
    let size = u32::from_be_bytes(media[..4].try_into().expect("a fragment opens with a box"));
    let moof = &media[..size as usize];
    let tfdt = find_box(moof, b"tfdt").expect("the fragment says where it decodes from");
    let start = u64::from_be_bytes(tfdt[4..12].try_into().expect("a version 1 tfdt"));
    let trun = find_box(moof, b"trun").expect("the fragment runs its samples");
    let count = u32::from_be_bytes(trun[4..8].try_into().expect("a sample count")) as usize;
    let end = (0..count).fold(start, |end, index| {
        let at = 12 + index * 16;
        end + u64::from(u32::from_be_bytes(
            trun[at..at + 4].try_into().expect("a sample duration"),
        ))
    });
    (start, end)
}

/// A stream whose middle group is coded without B pictures, as a broadcast is
/// wherever the picture holds still enough not to need them.
fn mixed_reordering_stream() -> Vec<u8> {
    let reordered = read_fixture("ibbp.m2v");
    let in_order = read_fixture("ip.m2v");
    // Pictures per fixture, which is what its timestamps have to advance by.
    let groups: [(&[u8], u64); 3] = [(&reordered, 15), (&in_order, 10), (&reordered, 15)];
    let mut pts = 900_000;
    let mut units: Vec<PesUnit<'_>> = Vec::new();
    for (payload, pictures) in groups {
        units.push(PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload,
            pts: Some(pts),
        });
        pts += pictures * FRAME_TICKS;
    }
    mux_transport_stream(
        &[(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)],
        &units,
        &mut HashMap::new(),
    )
}

/// The decode timeline is one line the units are laid along end to end, and a
/// unit that measured its own reorder delay put the group without B pictures a
/// frame off it: a hole in front of that group and, coming out of it, its last
/// sample landing on the decode time of the next group's first. Media Source
/// Extensions reads the overlap as an append over frames it already holds and
/// clears them back to a random access point, which these streams carry only
/// every few hundred pictures, so the picture freezes until the next one.
#[test]
fn a_group_without_b_pictures_does_not_break_the_decode_timeline() {
    let fragments = run_session(&mixed_reordering_stream(), 64 * 1024);
    let (_, media) = split_fragments(&fragments);
    assert!(media.len() >= 3, "one fragment per group: {}", media.len());

    let mut previous: Option<u64> = None;
    for (index, fragment) in media.iter().enumerate() {
        let Fragment::Media { data, .. } = fragment else {
            unreachable!()
        };
        let (start, end) = video_decode_span(data);
        if let Some(previous) = previous {
            assert_eq!(
                start, previous,
                "fragment {index} decodes from {start}, and the one before it ran to {previous}"
            );
        }
        previous = Some(end);
    }
}

/// The coded width and height of the first video sample entry in an
/// initialization segment, read back out of the `moov` the muxer wrote.
fn sample_entry_size(init: &[u8], sample_entry_type: &[u8; 4]) -> (u16, u16) {
    // From the sample description box, since `avc1` is also a brand in `ftyp`.
    let stsd = init
        .windows(4)
        .position(|window| window == b"stsd")
        .expect("the init segment describes a track");
    let at = stsd
        + init[stsd..]
            .windows(4)
            .position(|window| window == sample_entry_type)
            .expect("the init segment describes a video track");
    // Past the four-character code: six reserved bytes, the data reference
    // index, sixteen more reserved, and then the coded size.
    let width = u16::from_be_bytes([init[at + 28], init[at + 29]]);
    let height = u16::from_be_bytes([init[at + 30], init[at + 31]]);
    (width, height)
}

/// Two programmes coded at different frame sizes, one after the other, which
/// is what a station switching between its services sends.
fn resolution_change_stream() -> Vec<u8> {
    let mut es = repeat_fixture("ibbp.m2v", 2);
    es.extend_from_slice(&read_fixture("hd1080i.m2v"));
    let units: Vec<PesUnit<'_>> = es
        .chunks(20_000)
        .enumerate()
        .map(|(index, payload)| PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload,
            pts: Some(900_000 + index as u64 * 3_000),
        })
        .collect();
    mux_transport_stream(
        &[(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)],
        &units,
        &mut HashMap::new(),
    )
}

#[test]
fn a_new_frame_size_is_described_again_and_restarts_the_decoder() {
    let fragments = run_session(&resolution_change_stream(), 256 * 1024);
    let (init, _) = split_fragments(&fragments);

    assert_eq!(init.len(), 2, "one description per frame size");
    let sizes: Vec<(u16, u16)> = init
        .iter()
        .map(|fragment| {
            let Fragment::Init { data, .. } = fragment else {
                unreachable!()
            };
            sample_entry_size(data, b"avc1")
        })
        .collect();
    assert_eq!(sizes, vec![(352, 288), (1440, 1080)]);

    // The second description reaches the SourceBuffer before the media it
    // describes, and that media opens at an IDR: H.264 activates a new
    // sequence parameter set nowhere else.
    let second = fragments
        .iter()
        .rposition(|fragment| matches!(fragment, Fragment::Init { .. }))
        .expect("the second init segment");
    assert!(
        matches!(
            fragments.get(second + 1),
            Some(Fragment::Media {
                random_access: true,
                ..
            })
        ),
        "the fragment after a new description restarts the decoder"
    );
    let restarts = fragments
        .iter()
        .filter(|fragment| {
            matches!(
                fragment,
                Fragment::Media {
                    random_access: true,
                    ..
                }
            )
        })
        .count();
    assert_eq!(restarts, 2, "the stream opening, and the change");

    // Everything after the change is timed on the same timeline as everything
    // before it, so a player appends it where it stands.
    let (_, media) = split_fragments(&fragments);
    let mut previous = -1.0;
    for fragment in &media {
        let Fragment::Media {
            start,
            video_samples,
            ..
        } = fragment
        else {
            unreachable!()
        };
        assert!(*start > previous, "{start} follows {previous}");
        previous = *start;
        assert!(*video_samples > 0);
    }
    assert!(media.len() > 2, "both programmes produced fragments");
}

#[test]
fn a_new_frame_size_is_described_again_on_the_passthrough_path() {
    let options = TranscodeOptions {
        video: mpeg2toh264::VideoMode::Passthrough,
        ..TranscodeOptions::default()
    };
    let fragments = run_session_with_options(&resolution_change_stream(), 256 * 1024, options);
    let (init, media) = split_fragments(&fragments);

    let sizes: Vec<(u16, u16)> = init
        .iter()
        .map(|fragment| {
            let Fragment::Init { data, .. } = fragment else {
                unreachable!()
            };
            sample_entry_size(data, b"mp4v")
        })
        .collect();
    assert_eq!(sizes, vec![(352, 288), (1440, 1080)]);
    assert!(media.len() > 2, "both programmes produced fragments");
}

#[test]
fn emits_a_recovery_point_every_twenty_fourth_group() {
    // Recovery points are what let a player evict what it has already shown.
    let options = TranscodeOptions {
        recovery_interval: 24,
        ..TranscodeOptions::default()
    };
    let fragments = run_session_with_options(&video_only_stream(26), 256 * 1024, options);
    let (_, media) = split_fragments(&fragments);
    let restarts: Vec<usize> = media
        .iter()
        .enumerate()
        .filter(|(_, f)| {
            matches!(
                f,
                Fragment::Media {
                    random_access: true,
                    ..
                }
            )
        })
        .map(|(index, _)| index)
        .collect();
    assert_eq!(
        restarts,
        vec![0, 24],
        "the opening fragment, then a recovery point every 24th"
    );
}

#[test]
fn continuous_playback_does_not_restart_at_an_open_gop() {
    let pictures_per_gop = parse_elementary_stream(&read_fixture("ibbp.m2v"))
        .expect("fixture parses")
        .len();
    let fragments = run_session(&video_only_stream(26), 256 * 1024);
    let (_, media) = split_fragments(&fragments);

    assert_eq!(media.len(), 26);
    for (index, fragment) in media.iter().enumerate().skip(1) {
        let Fragment::Media {
            data,
            random_access,
            video_samples,
            ..
        } = fragment
        else {
            unreachable!()
        };
        assert_eq!(*random_access, index == 24);
        assert_eq!(
            data.windows(9)
                .any(|bytes| bytes == [0, 0, 0, 5, 6, 6, 1, 0xe4, 0x80]),
            index == 24,
            "GOP {index} recovery-point SEI"
        );
        if index == 24 {
            let trun = data
                .windows(4)
                .position(|bytes| bytes == b"trun")
                .expect("fragment has a video trun");
            let flags: Vec<u32> = (0..*video_samples)
                .map(|sample| {
                    let at = trun + 24 + sample * 16;
                    u32::from_be_bytes(data[at..at + 4].try_into().expect("sample flags"))
                })
                .collect();
            assert_eq!(
                flags.iter().filter(|&&flags| flags == 0x0200_0000).count(),
                1,
                "only the IDR after the leading pictures is a sync sample"
            );
            assert_ne!(flags[0], 0x0200_0000, "the first intra is only pre-roll");
        }
        assert_eq!(
            *video_samples,
            pictures_per_gop + 2 * usize::from(index == 24),
            "GOP {index} preserves its pictures and adds the recovery IDR and clone"
        );
    }
}

#[test]
fn audio_pending_timeline_keeps_open_gop_pictures_at_a_recovery_point() {
    let pictures_per_gop = parse_elementary_stream(&read_fixture("ibbp.m2v"))
        .expect("fixture parses")
        .len();
    let fragments = run_session(&av_stream(26, 800), 256 * 1024);
    let (_, media) = split_fragments(&fragments);
    let recovery = media.get(24).expect("the recovery GOP is emitted");
    let Fragment::Media {
        random_access,
        video_samples,
        ..
    } = recovery
    else {
        unreachable!()
    };

    assert!(*random_access);
    assert_eq!(*video_samples, pictures_per_gop + 2);
}

#[test]
fn recovery_points_preserve_distinct_leading_b_pictures() {
    let source = read_fixture("open_gop_leading_bb.m2v");
    let source_pictures = parse_elementary_stream(&source)
        .expect("fixture parses")
        .len();
    assert_eq!(source_pictures, 46);

    let options = TranscodeOptions {
        // Exercise every genuine open-GOP boundary in the fixture.
        recovery_interval: 1,
        ..TranscodeOptions::default()
    };
    let stream = wrap_mpeg2_es_in_ts(&source, Some(900_000), &mut HashMap::new());
    let fragments = run_session_with_options(&stream, 64 * 1024, options);
    let (_, media) = split_fragments(&fragments);
    let video_samples: usize = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { video_samples, .. } => *video_samples,
            _ => unreachable!(),
        })
        .sum();

    // One clone belongs to the opening IDR, and two samples belong to each
    // periodic IDR and its clone. Every source picture is retained.
    assert_eq!(video_samples, source_pictures + 1 + 2 * (media.len() - 1));
    assert!(media.iter().skip(1).all(|fragment| matches!(
        fragment,
        Fragment::Media {
            random_access: true,
            ..
        }
    )));
    assert!(media.iter().skip(1).all(|fragment| match fragment {
        Fragment::Media { data, .. } => data
            .windows(9)
            .any(|bytes| bytes == [0, 0, 0, 5, 6, 6, 1, 0xe4, 0x80]),
        _ => false,
    }));
}

#[test]
fn non_idr_open_gop_recovery_preserves_pictures_without_adding_copies() {
    let source = read_fixture("open_gop_leading_bb.m2v");
    let source_pictures = parse_elementary_stream(&source)
        .expect("fixture parses")
        .len();
    let options = TranscodeOptions {
        recovery_interval: 1,
        open_gop_recovery: OpenGopRecovery::RecoveryPoint,
        ..TranscodeOptions::default()
    };
    let stream = wrap_mpeg2_es_in_ts(&source, Some(900_000), &mut HashMap::new());
    let fragments = run_session_with_options(&stream, 64 * 1024, options);
    let (_, media) = split_fragments(&fragments);
    let video_samples: usize = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { video_samples, .. } => *video_samples,
            _ => unreachable!(),
        })
        .sum();

    // The opening IDR contributes one clone; periodic non-IDR recovery points
    // contribute no additional samples. Every source picture is retained.
    assert_eq!(video_samples, source_pictures + 1);
    assert!(media.iter().skip(1).all(|fragment| matches!(
        fragment,
        Fragment::Media {
            random_access: true,
            ..
        }
    )));
    assert!(media.iter().skip(1).all(|fragment| match fragment {
        Fragment::Media { data, .. } => data
            .windows(9)
            .any(|bytes| bytes == [0, 0, 0, 5, 6, 6, 1, 0xe4, 0x80]),
        _ => false,
    }));
}

#[test]
fn discard_open_gop_recovery_drops_only_the_leading_pictures() {
    let source = read_fixture("open_gop_leading_bb.m2v");
    let source_pictures = parse_elementary_stream(&source)
        .expect("fixture parses")
        .len();
    let options = TranscodeOptions {
        recovery_interval: 1,
        open_gop_recovery: OpenGopRecovery::Discard,
        ..TranscodeOptions::default()
    };
    let stream = wrap_mpeg2_es_in_ts(&source, Some(900_000), &mut HashMap::new());
    let fragments = run_session_with_options(&stream, 64 * 1024, options);
    let (_, media) = split_fragments(&fragments);
    let video_samples: usize = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { video_samples, .. } => *video_samples,
            _ => unreachable!(),
        })
        .sum();

    // Each periodic boundary drops one leading logical B picture (the
    // fixture's red/blue pair is its two fields). The opening IDR has one clone.
    assert_eq!(video_samples, source_pictures + 1 - (media.len() - 1));
    assert!(media.iter().skip(1).all(|fragment| matches!(
        fragment,
        Fragment::Media {
            random_access: true,
            ..
        }
    )));
}

#[test]
fn the_result_does_not_depend_on_how_the_input_is_chunked() {
    let stream = video_only_stream(3);
    let coarse = run_session(&stream, 1 << 20);
    let fine = run_session(&stream, 1000);

    assert_eq!(coarse.len(), fine.len());
    for (a, b) in coarse.iter().zip(&fine) {
        match (a, b) {
            (
                Fragment::Init {
                    data: a,
                    mime_codec: ma,
                    ..
                },
                Fragment::Init {
                    data: b,
                    mime_codec: mb,
                    ..
                },
            ) => {
                assert_eq!(a, b);
                assert_eq!(ma, mb);
            }
            (
                Fragment::Media {
                    data: a, start: sa, ..
                },
                Fragment::Media {
                    data: b, start: sb, ..
                },
            ) => {
                assert_eq!(a, b);
                assert_eq!(sa, sb);
            }
            _ => panic!("fragment kinds diverged"),
        }
    }
}

#[test]
fn carries_aac_audio_through_untouched() {
    let audio_frames = 300;
    let fragments = run_session(&av_stream(3, audio_frames), 64 * 1024);
    let (init, media) = split_fragments(&fragments);

    let Fragment::Init {
        mime_codec, data, ..
    } = init[0]
    else {
        unreachable!()
    };
    assert!(mime_codec.contains("avc1."), "{mime_codec}");
    assert!(mime_codec.contains("mp4a.40.2"), "{mime_codec}");
    assert!(
        data.windows(4).any(|w| w == b"esds"),
        "the audio configuration travels in an esds box"
    );
    assert_eq!(
        data.windows(4).filter(|w| *w == b"trak").count(),
        2,
        "one track each for video and audio"
    );

    let total_audio: usize = media
        .iter()
        .map(|f| match f {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();
    assert_eq!(
        total_audio, audio_frames,
        "every access unit fed in comes out again"
    );
}

/// How many channels the first audio sample entry of an initialization segment
/// declares.
fn sample_entry_channels(init: &[u8]) -> u16 {
    let at = init
        .windows(4)
        .position(|window| window == b"mp4a")
        .expect("the init segment describes an audio track");
    // Past the four-character code: six reserved bytes, the data reference
    // index, and eight more reserved, then the channel count.
    u16::from_be_bytes([init[at + 20], init[at + 21]])
}

/// Where the media of a run of fragments ends, and how much sound it carried.
fn presentation_end(fragments: &[Fragment]) -> (f64, usize) {
    let mut end = 0.0f64;
    let mut audio = 0;
    for fragment in fragments {
        if let Fragment::Media {
            data,
            start,
            audio_samples,
            ..
        } = fragment
        {
            let (decode_start, decode_end) = video_decode_span(data);
            end = end.max(*start + (decode_end - decode_start) as f64 / 90_000.0);
            audio += audio_samples;
        }
    }
    (end, audio)
}

#[test]
fn a_hole_in_the_recording_does_not_move_what_follows_it() {
    // Pictures and access units are laid down one after another, so a stretch
    // the recording lost would close up and everything after it would play
    // early -- by a fraction of a second here, and permanently. The captions
    // carry the source's own timestamps and do not move with it, so they would
    // be that far out for the rest of the stream. The picture is held over the
    // hole and the sound filled with silence instead, which leaves the whole
    // presentation where the source put it.
    let stream = timed_av_stream(10);
    let packets = stream.len() / 188;
    let lossy = with_packets_dropped(&stream, packets / 2, packets / 20);

    let (intact_end, intact_audio) = presentation_end(&run_session(&stream, 64 * 1024));
    let (lossy_end, lossy_audio) = presentation_end(&run_session(&lossy, 64 * 1024));

    assert!(
        (intact_end - lossy_end).abs() < 0.05,
        "the last fragment sits at {lossy_end}s where the whole recording puts it at {intact_end}s"
    );
    assert!(
        intact_audio.abs_diff(lossy_audio) <= 1,
        "the sound is {lossy_audio} access units against {intact_audio}, so the hole was not filled"
    );
}

#[test]
fn a_transport_hole_keeps_pictures_completed_before_the_missing_packet() {
    // Each 20 kB PES carries several complete picture starts. Losing its last
    // transport packet leaves an unfinished final picture, but the pictures
    // ending before that packet remain valid input to the transcoder.
    let stream = video_only_stream(2);
    let video_starts: Vec<usize> = stream
        .chunks(188)
        .enumerate()
        .filter(|(_, packet)| {
            let pid = (((packet[1] & 0x1f) as u16) << 8) | packet[2] as u16;
            pid == VIDEO_PID && packet[1] & 0x40 != 0
        })
        .map(|(index, _)| index)
        .collect();
    assert!(video_starts.len() > 4);
    let count_video_samples = |stream: &[u8]| {
        run_session(stream, 64 * 1024)
            .iter()
            .map(|fragment| match fragment {
                Fragment::Media { video_samples, .. } => *video_samples,
                _ => 0,
            })
            .sum::<usize>()
    };
    let intact_samples = count_video_samples(&stream);
    let final_packet_missing =
        count_video_samples(&with_packets_dropped(&stream, video_starts[3] - 1, 1));
    let earlier_packet_missing =
        count_video_samples(&with_packets_dropped(&stream, video_starts[3] - 2, 1));

    assert_eq!(intact_samples, 31, "the intact fixture is the control");
    assert_eq!(
        final_packet_missing, 24,
        "pictures bounded before a loss at the PES tail remain available"
    );
    assert_eq!(
        earlier_packet_missing, 20,
        "an earlier loss retains only the shorter byte-complete prefix"
    );
}

#[test]
fn a_transport_hole_still_uses_the_field_and_open_gop_rules() {
    // The prefix retained before a hole still goes through the ordinary
    // field-pair and open-GOP filters. The 1080i fixture checks the interlaced
    // timeline; the open-GOP fixture begins groups with complementary B fields.
    // The sample counts are the externally visible decisions of those filters
    // at two loss positions; the splitter does not duplicate their policy.
    for (name, copies, expected_tail, expected_earlier) in [
        ("hd1080i.m2v", 4, 48, 48),
        ("open_gop_leading_bb.m2v", 2, 88, 84),
    ] {
        let stream = video_stream_from_fixture(name, copies);
        let video_starts: Vec<usize> = stream
            .chunks(188)
            .enumerate()
            .filter(|(_, packet)| {
                let pid = (((packet[1] & 0x1f) as u16) << 8) | packet[2] as u16;
                pid == VIDEO_PID && packet[1] & 0x40 != 0
            })
            .map(|(index, _)| index)
            .collect();
        let count = |stream: &[u8]| {
            run_session(stream, 64 * 1024)
                .iter()
                .map(|fragment| match fragment {
                    Fragment::Media { video_samples, .. } => *video_samples,
                    _ => 0,
                })
                .sum::<usize>()
        };
        assert!(
            video_starts.len() > 3,
            "{name} needs at least four video PES starts"
        );
        let intact = count(&stream);
        let tail = count(&with_packets_dropped(&stream, video_starts[3] - 1, 1));
        let earlier = count(&with_packets_dropped(&stream, video_starts[3] - 2, 1));
        assert!(
            earlier <= tail && tail <= intact,
            "{name}: rescue must not add pictures beyond the intact stream"
        );
        assert_eq!(
            (tail, earlier),
            (expected_tail, expected_earlier),
            "{name} retains only the structurally usable prefix at each loss position",
        );
    }
}

#[test]
fn hidden_packet_loss_at_payload_discontinuities_recovers_both_tracks() {
    // A payload-bearing discontinuity marker resets the counter baseline, so
    // loss immediately before it cannot be proved by transport continuity.
    // The elementary-stream parsers must still recover at the next complete
    // GOP and ADTS frame instead of stopping the session or moving its tail.
    let video = read_fixture("ibbp.m2v");
    let audio = adts_stream(32, 3, 2);
    let mut units = Vec::new();
    for copy in 0..4u64 {
        units.push(PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload: &video,
            pts: Some(900_000 + copy * 36_000),
        });
        units.push(PesUnit {
            pid: AUDIO_PID,
            stream_id: 0xc0,
            payload: &audio,
            pts: Some(900_000 + copy * 57_600),
        });
    }
    let intact = mux_transport_stream(
        &[
            (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
            (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        ],
        &units,
        &mut HashMap::new(),
    );
    let mut lossy = intact.clone();

    for pid in [VIDEO_PID, AUDIO_PID] {
        // The last packet of a bounded PES already has an adaptation field.
        // Marking it discontinuous after dropping its predecessor hides that
        // loss from the next continuity-counter comparison.
        let starts: Vec<usize> = lossy
            .chunks(188)
            .enumerate()
            .filter(|(_, packet)| {
                let packet_pid = (((packet[1] & 0x1f) as u16) << 8) | packet[2] as u16;
                packet_pid == pid && packet[1] & 0x40 != 0
            })
            .map(|(index, _)| index)
            .collect();
        let marker = starts[1] - 1;
        assert!(marker > starts[0] + 1, "the first PES spans enough packets");
        assert_ne!(lossy[marker * 188 + 3] & 0x20, 0);
        assert_ne!(lossy[marker * 188 + 4], 0);
        lossy[marker * 188 + 5] |= 0x80;
        lossy.drain((marker - 1) * 188..marker * 188);
    }

    let (intact_end, intact_audio) = presentation_end(&run_session(&intact, 64 * 1024));
    let (lossy_end, lossy_audio) = presentation_end(&run_session(&lossy, 64 * 1024));

    assert!(
        (intact_end - lossy_end).abs() < 0.05,
        "the recovered tail ends at {lossy_end}s instead of {intact_end}s"
    );
    let missing_audio = intact_audio.abs_diff(lossy_audio);
    assert!(
        (1..=4).contains(&missing_audio),
        "the recovered sound lost {missing_audio} samples instead of only the damaged access units"
    );
}

#[test]
fn a_join_between_recordings_is_left_where_the_source_has_it() {
    // Two takes minutes apart, which is what a recording resumed after a stop
    // holds. Holding a picture across that would make a viewer sit through the
    // whole of it, and closing it up would move everything after it -- so the
    // media keeps its positions and the gap stays in the buffered ranges, where
    // whoever is driving playback can step over it.
    const JUMP: u64 = 120 * 90_000;
    let one = read_fixture("ibbp.m2v");
    let group = parse_elementary_stream(&one).expect("parses").len() as u64 * (90_000 / 25);
    let mut units = Vec::new();
    for copy in 0..6u64 {
        units.push(PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload: &one,
            pts: Some(900_000 + copy * group + if copy >= 3 { JUMP } else { 0 }),
        });
    }
    let stream = mux_transport_stream(
        &[(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)],
        &units,
        &mut HashMap::new(),
    );
    let starts = media_starts(&run_session(&stream, 64 * 1024));

    let steps: Vec<f64> = starts.windows(2).map(|pair| pair[1] - pair[0]).collect();
    let jumped = steps
        .iter()
        .filter(|&&step| step > 1.0)
        .copied()
        .collect::<Vec<f64>>();
    assert_eq!(jumped.len(), 1, "one step out of the ordinary in {steps:?}");
    assert!(
        (jumped[0] - (JUMP as f64 / 90_000.0) - group as f64 / 90_000.0).abs() < 0.1,
        "the join is {}s where the source puts it {}s apart",
        jumped[0],
        JUMP as f64 / 90_000.0
    );
}

#[test]
fn timestamps_that_wrap_are_not_a_hole_or_a_join() {
    // The timestamp field is 33 bits and comes back to zero every 26.5 hours.
    // A unit on the far side of that opens at a smaller number than the one
    // before it ended at, which -- measured without regard for the wrap -- is
    // either a jump of most of a day or a gap that swallows the recording.
    let one = read_fixture("ibbp.m2v");
    let group = parse_elementary_stream(&one).expect("parses").len() as u64 * (90_000 / 25);
    let modulus = 1u64 << 33;
    let base = modulus - group * 2;
    let units: Vec<PesUnit<'_>> = (0..6u64)
        .map(|copy| PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload: &one,
            pts: Some((base + copy * group) % modulus),
        })
        .collect();
    let stream = mux_transport_stream(
        &[(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)],
        &units,
        &mut HashMap::new(),
    );
    let starts = media_starts(&run_session(&stream, 64 * 1024));

    let expected = group as f64 / 90_000.0;
    let steps: Vec<f64> = starts.windows(2).map(|pair| pair[1] - pair[0]).collect();
    assert!(steps.len() >= 4, "fragments on both sides of the wrap");
    assert!(
        steps.iter().all(|step| (step - expected).abs() < 0.05),
        "the groups are {steps:?} apart where every one of them is {expected}s"
    );

    // And with sound alongside it, which is measured on a clock of its own.
    let across = presentation_end(&run_session(
        &timed_av_stream_from(6, modulus - group * 2),
        64 * 1024,
    ));
    let ordinary = presentation_end(&run_session(&timed_av_stream(6), 64 * 1024));
    assert_eq!(
        across, ordinary,
        "a run that crosses the wrap plays out exactly as one that does not"
    );
}

#[test]
fn a_new_audio_configuration_is_described_again() {
    // A broadcast changes what its sound is between programmes, and the
    // initialization segment carries the audio configuration in its `esds` just
    // as it carries the picture in its `avcC`. Reading past the change used to
    // be refused outright, which ended the conversion there.
    let fragments = run_session(&audio_change_stream(8, 90, 90), 64 * 1024);
    let (init, media) = split_fragments(&fragments);

    assert_eq!(init.len(), 2, "one description per configuration");
    let channels: Vec<u16> = init
        .iter()
        .map(|fragment| {
            let Fragment::Init { data, .. } = fragment else {
                unreachable!()
            };
            sample_entry_channels(data)
        })
        .collect();
    assert_eq!(channels, vec![2, 6]);

    let second = fragments
        .iter()
        .rposition(|fragment| matches!(fragment, Fragment::Init { .. }))
        .expect("the second init segment");
    assert!(
        matches!(
            fragments.get(second + 1),
            Some(Fragment::Media {
                random_access: true,
                ..
            })
        ),
        "the fragment a new description opens is one a decoder can start on"
    );

    let audio_samples: usize = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();
    assert_eq!(
        audio_samples, 180,
        "every frame of both configurations comes out"
    );
}

#[test]
fn moving_the_sound_to_another_stream_does_not_splice_a_frame_across_the_change() {
    // The programme's own map moves its picture and its sound to other PIDs,
    // and the old sound stops in the middle of a frame -- which is where a
    // multiplexer cuts it. Carrying the half frame over joins it to the new
    // stream's bytes and makes one access unit belonging to neither: the
    // header still walks, so nothing downstream drops it, and a browser's
    // audio decoder refuses it outright and stops playing. The frame this
    // one claims is long enough to swallow most of what follows it, so
    // splicing it would show up in the count.
    let video_before = read_fixture("ibbp.m2v");
    let video_after = read_fixture("hd1080i.m2v");
    let audio_before = adts_stream(10, 3, 2);
    let cut_short = adts_frame(3, 2, 400);
    let audio_after = adts_stream(10, 3, 2);

    let before: &[(u16, u8)] = &[
        (0x200, STREAM_TYPE_MPEG2_VIDEO),
        (0x210, STREAM_TYPE_AAC_ADTS),
    ];
    let after: &[(u16, u8)] = &[
        (0x100, STREAM_TYPE_MPEG2_VIDEO),
        (0x110, STREAM_TYPE_AAC_ADTS),
    ];
    let mut continuity = HashMap::new();
    let mut stream = mux_programs(
        &[(101, 0x1f0, before)],
        &[
            PesUnit {
                pid: 0x200,
                stream_id: 0xe0,
                payload: &video_before,
                pts: Some(900_000),
            },
            PesUnit {
                pid: 0x210,
                stream_id: 0xc0,
                payload: &audio_before,
                pts: Some(900_000),
            },
            PesUnit {
                pid: 0x210,
                stream_id: 0xc0,
                payload: &cut_short[..20],
                pts: None,
            },
        ],
        &mut continuity,
    );
    stream.extend_from_slice(&mux_programs(
        &[(101, 0x1f0, after)],
        &[
            PesUnit {
                pid: 0x100,
                stream_id: 0xe0,
                payload: &video_after,
                pts: Some(1_000_000),
            },
            PesUnit {
                pid: 0x110,
                stream_id: 0xc0,
                payload: &audio_after,
                pts: None,
            },
        ],
        &mut continuity,
    ));

    let fragments = run_session(&stream, 64 * 1024);
    let (init, media) = split_fragments(&fragments);
    let audio_samples: usize = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();
    assert_eq!(
        audio_samples, 20,
        "every whole frame of both streams, and nothing made out of the join"
    );
    assert_eq!(
        init.len(),
        2,
        "the picture moved size along with the stream"
    );
}

/// A second sound stream, one AAC access unit of it, filled with a byte that
/// says which stream it came from.
///
/// The first byte is what makes it a channel pair rather than a single channel
/// element, which is what keeps the frame passing through to the fragment
/// unchanged: a single channel element is rebuilt as a pair, and the rebuilt
/// bytes are no longer the ones fed in.
fn marked_adts_frame(mark: u8) -> Vec<u8> {
    let mut payload = vec![mark; 32];
    payload[0] = 0x20;
    adts_frame_with_payload(3, 2, &payload)
}

/// A bilingual broadcast: one picture and two sounds, sent at once on streams
/// of their own, each frame marked with the stream it belongs to.
fn bilingual_av_stream(copies: usize) -> Vec<u8> {
    const SECOND_AUDIO_PID: u16 = 0x103;
    let one = read_fixture("ibbp.m2v");
    let pictures = parse_elementary_stream(&one).expect("parses").len() as u64;
    const FRAME: u64 = 90_000 / 25;
    const AAC: u64 = 1024 * 90_000 / 48_000;
    let group = pictures * FRAME;
    let streams = &[
        (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
        (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        (SECOND_AUDIO_PID, STREAM_TYPE_AAC_ADTS),
    ];

    let mut emitted = 0u64;
    let mut out = Vec::new();
    let mut continuity = HashMap::new();
    for copy in 0..copies as u64 {
        let through = (copy + 1) * group / AAC;
        let first = emitted;
        let (mut main, mut second) = (Vec::new(), Vec::new());
        while emitted < through {
            main.extend_from_slice(&marked_adts_frame(MAIN_SOUND));
            second.extend_from_slice(&marked_adts_frame(SECOND_SOUND));
            emitted += 1;
        }
        let mut units = vec![PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload: &one,
            pts: Some(900_000 + copy * group),
        }];
        if !main.is_empty() {
            units.push(PesUnit {
                pid: AUDIO_PID,
                stream_id: 0xc0,
                payload: &main,
                pts: Some(900_000 + first * AAC),
            });
            units.push(PesUnit {
                pid: SECOND_AUDIO_PID,
                stream_id: 0xc0,
                payload: &second,
                pts: Some(900_000 + first * AAC),
            });
        }
        out.extend_from_slice(&mux_transport_stream(streams, &units, &mut continuity));
    }
    out
}

const MAIN_SOUND: u8 = 0xa7;
const SECOND_SOUND: u8 = 0xb9;

/// Whether a fragment carries sound from the stream marked this way. Sixteen
/// bytes of one value is a run the converted picture does not have in it.
fn carries_sound(fragment: &Fragment, mark: u8) -> bool {
    let Fragment::Media { data, .. } = fragment else {
        return false;
    };
    data.windows(16).any(|run| run.iter().all(|&b| b == mark))
}

#[test]
fn changing_the_sound_changes_what_the_fragments_after_it_carry() {
    // A viewer pressing the button during a live broadcast is asking for the
    // other sound from here on. The fragments already made carry the sound that
    // was chosen when they were made and have been appended, so nothing goes
    // back over them -- what changes is what the next ones are built from.
    let stream = bilingual_av_stream(6);
    let mut session = Session::new(TranscodeOptions::default());
    let chunks: Vec<&[u8]> = stream.chunks(16 * 1024).collect();
    let switch_at = chunks.len() / 2;
    let mut fragments = Vec::new();
    for (index, chunk) in chunks.iter().enumerate() {
        if index == switch_at {
            let second = session.audio_streams()[1].pid;
            session.select_audio(second);
        }
        fragments.extend(session.push(chunk).expect("push succeeds"));
    }
    fragments.extend(session.finish().expect("finish succeeds"));

    let media: Vec<&Fragment> = fragments
        .iter()
        .filter(|fragment| matches!(fragment, Fragment::Media { .. }))
        .collect();
    let first = media.first().expect("a first fragment");
    let last = media.last().expect("a last fragment");
    assert!(
        carries_sound(first, MAIN_SOUND) && !carries_sound(first, SECOND_SOUND),
        "the sound before the switch is the one that was being read"
    );
    assert!(
        carries_sound(last, SECOND_SOUND) && !carries_sound(last, MAIN_SOUND),
        "and after it, the one that was asked for"
    );

    // The sound is laid down access unit by access unit, so a switch that lost
    // or duplicated one would put the rest of the stream out against the
    // picture by that much and leave it there.
    let switched: usize = fragments
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();
    let (_, straight) = presentation_end(&run_session(&stream, 16 * 1024));
    assert_eq!(
        switched, straight,
        "as many access units as a run that never switched"
    );
}

#[test]
fn conceals_a_missing_aac_frame_instead_of_stalling_video() {
    let video = repeat_fixture("ibbp.m2v", 4);
    let audio = adts_stream(1, 3, 2);
    let mut units = vec![PesUnit {
        pid: VIDEO_PID,
        stream_id: 0xe0,
        payload: &video,
        pts: Some(900_000),
    }];
    for index in 0..120u64 {
        units.push(PesUnit {
            pid: AUDIO_PID,
            stream_id: 0xc0,
            payload: &audio,
            // One 48 kHz AAC access unit is absent halfway through.
            pts: Some(900_000 + index * 1_920 + u64::from(index >= 60) * 1_920),
        });
    }
    let stream = mux_transport_stream(
        &[
            (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
            (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        ],
        &units,
        &mut HashMap::new(),
    );
    let fragments = run_session(&stream, 64 * 1024);
    let (_, media) = split_fragments(&fragments);
    let audio_samples: usize = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();

    assert_eq!(audio_samples, 121, "the missing timeline slot is concealed");
    assert_eq!(media.len(), 4, "every video GOP is emitted");
}

/// The audio of a recording can run out before its video does, and a `trun`
/// describing no samples is not something to hand a parser: the track with
/// nothing in a fragment takes no `traf` in it.
#[test]
fn a_fragment_with_no_audio_leaves_the_audio_track_out_of_it() {
    let fragments = run_session(&av_stream(4, 20), 64 * 1024);
    let (_, media) = split_fragments(&fragments);
    let mut silent = 0;
    for fragment in &media {
        let Fragment::Media {
            data,
            audio_samples,
            ..
        } = fragment
        else {
            unreachable!()
        };
        let trafs = data.windows(4).filter(|w| *w == b"traf").count();
        if *audio_samples == 0 {
            silent += 1;
            assert_eq!(trafs, 1, "only the video track is in this fragment");
        } else {
            assert_eq!(trafs, 2, "both tracks are in this fragment");
        }
    }
    assert!(silent > 0, "the audio ran out before the video did");
}

#[test]
fn spreads_audio_across_the_fragments_it_belongs_to() {
    let fragments = run_session(&av_stream(4, 400), 64 * 1024);
    let (_, media) = split_fragments(&fragments);
    let per_fragment: Vec<usize> = media
        .iter()
        .map(|f| match f {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .collect();
    assert!(
        per_fragment.iter().filter(|&&n| n > 0).count() >= 2,
        "audio is not all dumped into one fragment: {per_fragment:?}"
    );
    // Every fragment but the last carries roughly a group's worth of audio.
    for (index, &count) in per_fragment.iter().enumerate().take(per_fragment.len() - 1) {
        assert!(count > 0, "fragment {index} has no audio at all");
    }
}

// ------------------------------------------------------ resuming mid-stream

/// Ticks of one picture of the fixture, at 25 Hz.
const FRAME_TICKS: u64 = 3_600;

/// Ticks of one copy of the fixture: fifteen pictures at 25 Hz.
const GOP_TICKS: u64 = 15 * FRAME_TICKS;

/// A stream a cut can be taken out of the middle of.
///
/// It differs from the ones above in the two ways a real broadcast does and
/// they do not: the program map is repeated rather than sent once, so a cut
/// still says what its PIDs are, and the timestamps advance with the pictures
/// rather than with the bytes, so a resumed session and a session that read the
/// whole file can be expected to agree.
fn seekable_stream(copies: usize, audio_per_copy: usize) -> Vec<u8> {
    let video = read_fixture("ibbp.m2v");
    let audio = adts_stream(audio_per_copy, 3, 2);
    let mut streams = vec![(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)];
    if audio_per_copy > 0 {
        streams.push((AUDIO_PID, STREAM_TYPE_AAC_ADTS));
    }
    let mut continuity = HashMap::new();
    let mut out = Vec::new();
    for copy in 0..copies as u64 {
        let mut units = vec![PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload: &video,
            pts: Some(900_000 + copy * GOP_TICKS),
        }];
        if audio_per_copy > 0 {
            units.push(PesUnit {
                pid: AUDIO_PID,
                stream_id: 0xc0,
                payload: &audio,
                // The audio starts a little after the video, as a broadcast's does.
                pts: Some(903_600 + copy * GOP_TICKS),
            });
        }
        // Each call opens with a PAT and a PMT, which is the repetition.
        out.extend_from_slice(&mux_transport_stream(&streams, &units, &mut continuity));
    }
    out
}

/// Run a session over `stream`, and report the origin its timeline settled on.
fn run_anchored(stream: &[u8], origin: Option<u64>) -> (Vec<Fragment>, Option<u64>) {
    let mut session = Session::anchored(TranscodeOptions::default(), origin);
    let mut fragments = Vec::new();
    for chunk in stream.chunks(64 * 1024) {
        fragments.extend(session.push(chunk).expect("push succeeds"));
    }
    fragments.extend(session.finish().expect("finish succeeds"));
    (fragments, session.origin_ticks())
}

fn media_starts(fragments: &[Fragment]) -> Vec<f64> {
    fragments
        .iter()
        .filter_map(|f| match f {
            Fragment::Media { start, .. } => Some(*start),
            _ => None,
        })
        .collect()
}

/// Where in the byte stream to cut, on no boundary in particular.
fn midpoint(stream: &[u8]) -> usize {
    stream.len() / 2 + 37
}

#[test]
fn reports_the_origin_its_timeline_starts_from() {
    let (fragments, origin) = run_anchored(&seekable_stream(2, 0), None);
    let origin = origin.expect("the opening fragment fixes the origin");
    // A frame before the video, not on it: decoding leads display by a frame
    // and the opening fragment has to have somewhere to put that, or its
    // decode timeline is clamped to zero and runs into the fragment after it.
    assert_eq!(
        origin,
        900_000 - FRAME_TICKS,
        "a video-only timeline leaves the decode lead a frame in front of its video"
    );
    assert_eq!(media_starts(&fragments)[0], FRAME_TICKS as f64 / 90_000.0);
}

#[test]
fn an_anchored_session_puts_a_cut_where_the_whole_file_puts_it() {
    let stream = seekable_stream(6, 0);
    let (whole, origin) = run_anchored(&stream, None);
    let origin = origin.expect("the opening fragment fixes the origin");
    let whole_starts = media_starts(&whole);

    let (cut, _) = run_anchored(&stream[midpoint(&stream)..], Some(origin));
    let cut_starts = media_starts(&cut);

    assert!(
        !cut_starts.is_empty(),
        "the cut yields fragments of its own"
    );
    let first = cut_starts[0];
    assert!(
        first > 1.0,
        "the cut lands where it was taken from, not at the start: {first}"
    );
    let matched = whole_starts
        .iter()
        .any(|&start| (start - first).abs() < 0.04);
    assert!(
        matched,
        "cut starts at {first}, which is no fragment of {whole_starts:?}"
    );

    // The control: without an origin the same bytes open where the whole file
    // does, which is what a player appending them over a seek would place
    // wrongly.
    let (adrift, _) = run_anchored(&stream[midpoint(&stream)..], None);
    assert_eq!(media_starts(&adrift)[0], whole_starts[0]);
}

#[test]
fn an_anchored_session_carries_both_tracks_over_a_cut() {
    let stream = seekable_stream(6, 40);
    let (whole, origin) = run_anchored(&stream, None);
    let origin = origin.expect("the opening fragment fixes the origin");
    let whole_starts = media_starts(&whole);

    let (cut, _) = run_anchored(&stream[midpoint(&stream)..], Some(origin));
    let starts = media_starts(&cut);
    assert!(!starts.is_empty(), "the cut yields fragments of its own");
    assert!(
        whole_starts.iter().any(|&s| (s - starts[0]).abs() < 0.04),
        "cut starts at {}, which is no fragment of {whole_starts:?}",
        starts[0]
    );
    let audio: usize = cut
        .iter()
        .map(|f| match f {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();
    assert!(
        audio > 0,
        "the audio track resumes too -- the count it measures from is the \
         audio's own start, not the file's"
    );
}

#[test]
fn a_reported_restart_position_reopens_at_the_same_fragment() {
    let stream = seekable_stream(6, 40);
    let (whole, origin) = run_anchored(&stream, None);
    let origin = origin.expect("the whole stream fixes the timeline origin");
    let (restart, expected_start) = whole
        .iter()
        .find_map(|fragment| match fragment {
            Fragment::Media {
                start,
                restart_offset: Some(restart),
                ..
            } if *restart > 0 => Some((*restart as usize, *start)),
            _ => None,
        })
        .expect("a later repeated PAT/PMT opens a restartable fragment");

    let (resumed, _) = run_anchored(&stream[restart..], Some(origin));
    let (actual_start, audio_samples) = resumed
        .iter()
        .find_map(|fragment| match fragment {
            Fragment::Media {
                start,
                audio_samples,
                ..
            } => Some((*start, *audio_samples)),
            _ => None,
        })
        .expect("the reported position opens a media fragment");

    assert!(
        (actual_start - expected_start).abs() < 0.04,
        "restart opens at {actual_start}, not the reported fragment at {expected_start}"
    );
    assert!(
        audio_samples > 0,
        "the safe restart carries the audio track"
    );
}

// ------------------------------------------------------------- split groups

fn splitting(options: TranscodeOptions) -> TranscodeOptions {
    TranscodeOptions {
        split_groups: true,
        ..options
    }
}

/// Say where two sample lists first disagree, rather than printing both.
fn assert_same_samples(
    label: &str,
    track: &str,
    whole: &[TrackSample],
    split: &[TrackSample],
    compare_bytes: bool,
) {
    assert_eq!(
        whole.len(),
        split.len(),
        "{label}: {track} sample count, whole groups against split"
    );
    for (index, (whole, split)) in whole.iter().zip(split).enumerate() {
        let timing = |sample: &TrackSample| {
            (
                sample.decode_time,
                sample.composition_time,
                sample.duration,
                sample.sync,
            )
        };
        assert_eq!(
            timing(whole),
            timing(split),
            "{label}: {track} sample {index} (decode time, composition time, duration, sync)"
        );
        if compare_bytes {
            assert!(
                whole.data == split.data,
                "{label}: {track} sample {index} has other bytes"
            );
        }
    }
}

/// Cutting the groups changes where the fragments end and nothing else: the
/// initialization segments and every sample of both tracks come out as they do
/// when the groups go out whole.
fn assert_split_matches_whole(label: &str, stream: &[u8], options: TranscodeOptions) {
    let whole = run_session_with_options(stream, 64 * 1024, options);
    let split = run_session_with_options(stream, 64 * 1024, splitting(options));
    assert!(
        init_segments(&whole) == init_segments(&split),
        "{label}: the initialization segments differ"
    );
    let (whole, split) = (track_samples(&whole), track_samples(&split));
    assert!(!whole.video.is_empty(), "{label}: the stream made no video");
    assert_same_samples(label, "video", &whole.video, &split.video, true);
    assert_same_samples(label, "audio", &whole.audio, &split.audio, true);
}

/// Every video sample the session makes, split or not.
fn video_sample_count(fragments: &[Fragment]) -> usize {
    fragments
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { video_samples, .. } => *video_samples,
            _ => 0,
        })
        .sum()
}

/// One PES per group, stamped where the group plays, as a broadcast does.
fn grouped_video_stream(groups: &[Vec<u8>]) -> Vec<u8> {
    let units: Vec<PesUnit<'_>> = groups
        .iter()
        .enumerate()
        .map(|(index, payload)| PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload,
            pts: Some(900_000 + index as u64 * GOP_TICKS),
        })
        .collect();
    mux_transport_stream(
        &[(VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO)],
        &units,
        &mut HashMap::new(),
    )
}

#[test]
fn cutting_groups_changes_the_fragments_and_not_the_samples() {
    let mut streams: Vec<(String, Vec<u8>)> = vec![
        ("ibbp".into(), video_only_stream(5)),
        ("ibbp with sound".into(), timed_av_stream(5)),
        (
            "open gop".into(),
            wrap_mpeg2_es_in_ts(
                &read_fixture("open_gop_leading_bb.m2v"),
                Some(900_000),
                &mut HashMap::new(),
            ),
        ),
        ("mixed reordering".into(), mixed_reordering_stream()),
    ];
    for name in FIXTURES {
        let copies = if name == "hd1080i.m2v" { 2 } else { 4 };
        streams.push((name.into(), video_stream_from_fixture(name, copies)));
    }
    // No fixture is coded as field pictures, so a group that mixes frame
    // pictures with field pairs, whose access unit delimiters the cut would
    // move, has no stream here to compare.
    for (name, stream) in &streams {
        for video in [VideoMode::Transcode, VideoMode::Passthrough] {
            for open_gop_recovery in [
                OpenGopRecovery::Idr,
                OpenGopRecovery::RecoveryPoint,
                OpenGopRecovery::Discard,
            ] {
                let options = TranscodeOptions {
                    video,
                    open_gop_recovery,
                    recovery_interval: 2,
                    ..TranscodeOptions::default()
                };
                assert_split_matches_whole(
                    &format!("{name}, {video:?}, {open_gop_recovery:?}"),
                    stream,
                    options,
                );
            }
        }
    }
}

/// The samples of a recovery point, with the picture that displays last of
/// those before them standing for the one they repeat.
fn recovery_copies_after(
    video: &[TrackSample],
    at: usize,
) -> (&TrackSample, &TrackSample, &TrackSample) {
    let source = video[..at]
        .iter()
        .max_by_key(|sample| sample.composition_time)
        .expect("a picture precedes the copies");
    (source, &video[at], &video[at + 1])
}

#[test]
fn periodic_recovery_copies_share_the_slot_of_the_picture_they_repeat() {
    let stream = video_stream_from_fixture("open_gop_leading_bb.m2v", 4);
    for recovery_interval in [1, 2, 3] {
        let options = TranscodeOptions {
            recovery_interval,
            ..TranscodeOptions::default()
        };
        assert_eq!(options.open_gop_recovery, OpenGopRecovery::Idr);
        assert_split_matches_whole(&format!("interval {recovery_interval}"), &stream, options);

        let video = track_samples(&run_session_with_options(&stream, 64 * 1024, options)).video;
        let restarts: Vec<usize> = (1..video.len()).filter(|&at| video[at].sync).collect();
        assert!(
            !restarts.is_empty(),
            "interval {recovery_interval}: no recovery point"
        );
        for at in restarts {
            let (source, idr, clone) = recovery_copies_after(&video, at);
            let label = format!("interval {recovery_interval}, recovery at sample {at}");
            // The picture and its copies follow each other and make up the
            // slot the picture had.
            assert_eq!(
                idr.composition_time,
                source.composition_time + i64::from(source.duration),
                "{label}"
            );
            assert_eq!(
                clone.composition_time,
                idr.composition_time + i64::from(idr.duration),
                "{label}"
            );
            assert_eq!(idr.duration, clone.duration, "{label}");
            assert_eq!(
                u64::from(source.duration + idr.duration + clone.duration),
                FRAME_TICKS,
                "{label}"
            );
            assert!(source.duration >= idr.duration, "{label}");
        }
        // The copies add samples and no time: the stream is as long as it is
        // when the picture is a recovery point of its own.
        let non_idr = TranscodeOptions {
            open_gop_recovery: OpenGopRecovery::RecoveryPoint,
            ..options
        };
        let reference = track_samples(&run_session_with_options(&stream, 64 * 1024, non_idr)).video;
        let length =
            |video: &[TrackSample]| video.iter().map(|s| u64::from(s.duration)).sum::<u64>();
        assert_eq!(
            length(&video),
            length(&reference),
            "interval {recovery_interval}"
        );
    }
}

#[test]
fn cutting_groups_splits_them_into_an_anchor_and_the_b_pictures_after_it() {
    // The fixture codes I P B B P B B P B B P B B P B, so the units are the
    // opening I with its P and their two B pictures, three more anchors with
    // two, and a last with one. The opening fragment has the IDR's clone as
    // well.
    let fragments = run_session_with_options(
        &video_only_stream(2),
        64 * 1024,
        splitting(TranscodeOptions::default()),
    );
    let (_, media) = split_fragments(&fragments);
    let samples: Vec<usize> = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { video_samples, .. } => *video_samples,
            _ => unreachable!(),
        })
        .collect();
    assert_eq!(samples, vec![5, 3, 3, 3, 2, 4, 3, 3, 3, 2]);

    let restarts: Vec<_> = media
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media {
                random_access,
                restart_offset,
                ..
            } => (*random_access, *restart_offset),
            _ => unreachable!(),
        })
        .collect();
    assert_eq!(
        restarts,
        vec![
            (true, Some(0)),
            (false, None),
            (false, None),
            (false, None),
            (false, None),
            (false, Some(0)),
            (false, None),
            (false, None),
            (false, None),
            (false, None),
        ],
        "only a fragment that opens a group can be reopened from"
    );
}

/// How many transport packets had gone in when the first media fragment came
/// out.
fn packets_before_the_first_fragment(stream: &[u8], options: TranscodeOptions) -> usize {
    let mut session = Session::new(options);
    for (index, packet) in stream.chunks(188).enumerate() {
        let fragments = session.push(packet).expect("push succeeds");
        if fragments
            .iter()
            .any(|fragment| matches!(fragment, Fragment::Media { .. }))
        {
            return index + 1;
        }
    }
    panic!("no media fragment came out");
}

#[test]
fn a_fragment_comes_out_before_its_group_is_complete() {
    let stream = video_only_stream(3);
    let whole = packets_before_the_first_fragment(&stream, TranscodeOptions::default());
    let split = packets_before_the_first_fragment(&stream, splitting(TranscodeOptions::default()));
    // The first unit is complete once the second anchor picture's header is in,
    // which is a third of the way into the group, where a whole group needs the
    // header of the one after it.
    assert!(
        split * 2 < whole,
        "the first fragment came after {split} packets where the group needs {whole}"
    );
}

#[test]
fn a_split_stream_gets_a_recovery_point_every_twenty_fourth_group() {
    let options = splitting(TranscodeOptions {
        recovery_interval: 24,
        ..TranscodeOptions::default()
    });
    let fragments = run_session_with_options(&video_only_stream(26), 256 * 1024, options);
    let (_, media) = split_fragments(&fragments);
    let restarts: Vec<usize> = media
        .iter()
        .enumerate()
        .filter(|(_, f)| {
            matches!(
                f,
                Fragment::Media {
                    random_access: true,
                    ..
                }
            )
        })
        .map(|(index, _)| index)
        .collect();
    assert_eq!(
        restarts,
        vec![0, 24 * 5],
        "the opening fragment, then the first of every 24th group's five"
    );
}

#[test]
fn the_result_of_a_split_stream_does_not_depend_on_how_the_input_is_chunked() {
    let options = splitting(TranscodeOptions::default());
    let stream = timed_av_stream(3);
    let coarse = run_session_with_options(&stream, 1 << 20, options);
    let fine = run_session_with_options(&stream, 1000, options);
    assert_eq!(video_sample_count(&coarse), video_sample_count(&fine));
    assert!(init_segments(&coarse) == init_segments(&fine));
    let (coarse, fine) = (track_samples(&coarse), track_samples(&fine));
    assert_same_samples("chunking", "video", &coarse.video, &fine.video, true);
    assert_same_samples("chunking", "audio", &coarse.audio, &fine.audio, true);

    let video_only = video_only_stream(3);
    let coarse = run_session_with_options(&video_only, 1 << 20, options);
    let fine = run_session_with_options(&video_only, 1000, options);
    assert_eq!(coarse.len(), fine.len());
    for (a, b) in coarse.iter().zip(&fine) {
        match (a, b) {
            (Fragment::Init { data: a, .. }, Fragment::Init { data: b, .. }) => assert_eq!(a, b),
            (
                Fragment::Media {
                    data: a, start: sa, ..
                },
                Fragment::Media {
                    data: b, start: sb, ..
                },
            ) => {
                assert_eq!(a, b);
                assert_eq!(sa, sb);
            }
            _ => panic!("fragment kinds diverged"),
        }
    }
}

/// The picture at `index` of `source` with the second half of its last slice
/// overwritten, so that it will not decode.
fn with_picture_damaged(source: &[u8], index: usize) -> Vec<u8> {
    let pictures = parse_elementary_stream(source).expect("parses");
    let slice = pictures[index]
        .slices
        .last()
        .expect("the picture has slices");
    let start = slice.data_start_bit.div_ceil(8);
    let end = slice.data_end_bit.expect("the last slice ends") / 8;
    let mut damaged = source.to_vec();
    damaged[(start + end) / 2..end].fill(0xff);
    damaged
}

#[test]
fn a_picture_that_will_not_decode_leaves_the_others_where_they_were() {
    // The B picture of the second group's third unit is damaged. Sent whole,
    // the pictures after it keep their display slots and the decode clock
    // simply runs one sample short; the units have to say the same between
    // them.
    let one = read_fixture("ibbp.m2v");
    let mut groups = vec![one.clone(), one.clone(), one.clone(), one.clone()];
    // Pictures 0-14 are the first group; the third unit of the second is
    // P9 B7 B8, at 22, 23 and 24.
    groups[1] = with_picture_damaged(&one, 8);
    let stream = grouped_video_stream(&groups);

    for video in [VideoMode::Transcode, VideoMode::Passthrough] {
        let options = TranscodeOptions {
            video,
            ..TranscodeOptions::default()
        };
        let whole = run_session_with_options(&stream, 64 * 1024, options);
        let split = run_session_with_options(&stream, 64 * 1024, splitting(options));
        let (whole_samples, split_samples) = (track_samples(&whole), track_samples(&split));
        // The converted stream loses the damaged picture, and gains the clone
        // of the IDR the hole in front of the next group makes it open with.
        // Passthrough carries the damaged picture, which is the decoder's to
        // deal with, and has no clone to add.
        let expected = if video == VideoMode::Transcode {
            61
        } else {
            60
        };
        assert_eq!(video_sample_count(&whole), expected, "{video:?}");
        assert_same_samples(
            &format!("damaged group, {video:?}"),
            "video",
            &whole_samples.video,
            &split_samples.video,
            true,
        );
        let restarts = |fragments: &[Fragment]| {
            fragments
                .iter()
                .filter(|fragment| {
                    matches!(
                        fragment,
                        Fragment::Media {
                            random_access: true,
                            ..
                        }
                    )
                })
                .count()
        };
        assert_eq!(
            restarts(&split),
            restarts(&whole),
            "{video:?}: no restart point appears before the next group"
        );
    }
}

#[test]
fn a_hole_inside_a_group_leaves_what_follows_it_in_its_place() {
    // Losing a packet part way into the second group, at several places, so
    // that the group is cut at every kind of boundary. The pictures complete
    // before the hole are the ones that are kept, and nothing of the group
    // comes after it.
    let stream = grouped_video_stream(&vec![read_fixture("ibbp.m2v"); 3]);
    let packets = stream.len() / 188;
    let mut cases = 0;
    for at in (packets / 3..packets * 2 / 3).step_by(23) {
        let lossy = with_packets_dropped(&stream, at, 1);
        let whole = run_session_with_options(&lossy, 64 * 1024, TranscodeOptions::default());
        let split =
            run_session_with_options(&lossy, 64 * 1024, splitting(TranscodeOptions::default()));
        let (whole, split) = (track_samples(&whole), track_samples(&split));
        assert_same_samples(
            &format!("packet {at} lost"),
            "video",
            &whole.video,
            &split.video,
            true,
        );
        cases += 1;
    }
    assert!(cases > 4);
}

#[test]
fn a_unit_continuing_a_group_is_coded_against_the_scale_its_group_opened_with() {
    // Every picture but the first of each group loads a matrix of its own, so
    // the first picture of a unit in the middle of a group does too. The group
    // sent whole is coded against the list its first picture has, and a unit
    // that took the list from its own would come out differently.
    let one = read_fixture("ibbp.m2v");
    let extension = non_intra_matrix_extension(&[24; 64]);
    let pictures: Vec<usize> = (0..45).filter(|index| index % 15 != 0).collect();
    let adapted = with_extension_in_pictures(&one.repeat(3), &pictures, &extension);
    let stream = wrap_mpeg2_es_in_ts(&adapted, Some(900_000), &mut HashMap::new());
    assert_split_matches_whole(
        "matrix on every later picture",
        &stream,
        TranscodeOptions::default(),
    );
}

#[test]
fn a_unit_continuing_a_group_keeps_the_matrices_the_group_loaded() {
    // The first picture of a group loads a matrix, and the pictures after it
    // inherit it. The units after the first have to be decoded against it as
    // well, though nothing in them says so.
    let one = read_fixture("ibbp.m2v");
    let extension = non_intra_matrix_extension(&[24; 64]);
    let adapted = with_extension_in_pictures(&one.repeat(3), &[0, 15, 30], &extension);
    let plain = wrap_mpeg2_es_in_ts(&one.repeat(3), Some(900_000), &mut HashMap::new());
    let stream = wrap_mpeg2_es_in_ts(&adapted, Some(900_000), &mut HashMap::new());
    assert_split_matches_whole(
        "matrix on the first picture",
        &stream,
        TranscodeOptions::default(),
    );

    let plain = track_samples(&run_session(&plain, 64 * 1024));
    let adapted = track_samples(&run_session(&stream, 64 * 1024));
    assert!(
        plain.video[..]
            .iter()
            .zip(&adapted.video)
            .any(|(a, b)| a.data != b.data),
        "the matrix reaches the pictures"
    );
}

#[test]
fn a_picture_whose_slot_an_earlier_unit_covered_is_dropped_by_both_sides() {
    // A B picture coded again in the middle of the second unit, with a
    // temporal reference the first unit has used already. The timeline and the
    // transcoder both leave it out, or the fragment would claim a sample the
    // access units do not have.
    let one = read_fixture("ibbp.m2v");
    let starts = picture_starts(&one);
    let stray = one[starts[2]..starts[3]].to_vec();
    let mut doubled = one[..starts[6]].to_vec();
    doubled.extend_from_slice(&stray);
    doubled.extend_from_slice(&one[starts[6]..]);
    let stream = grouped_video_stream(&[doubled, one.clone()]);

    for video in [VideoMode::Transcode, VideoMode::Passthrough] {
        let options = TranscodeOptions {
            video,
            ..TranscodeOptions::default()
        };
        let whole = run_session_with_options(&stream, 64 * 1024, options);
        let split = run_session_with_options(&stream, 64 * 1024, splitting(options));
        assert_eq!(
            video_sample_count(&split) + 1,
            video_sample_count(&whole),
            "{video:?}: the repeated slot's picture is the one left out"
        );
    }
}

/// Every unit a splitter cuts `chunks` into, with the timestamp each chunk
/// carries.
fn split_into_units(splitter: &mut Mpeg2GopStream, chunks: &[(&[u8], u64)]) -> Vec<Mpeg2Gop> {
    let mut units = Vec::new();
    for &(chunk, pts) in chunks {
        units.extend(splitter.push(chunk, Some(pts)));
    }
    units.extend(splitter.finish());
    units
}

fn picture_types(unit: &Mpeg2Gop) -> Vec<PictureType> {
    parse_elementary_stream(&unit.data)
        .expect("a unit parses")
        .iter()
        .map(|picture| picture.header.picture_coding_type)
        .collect()
}

#[test]
fn cuts_a_group_before_each_anchor_that_follows_a_b_picture() {
    use PictureType::{B, I, P};
    let one = read_fixture("ibbp.m2v");
    let starts = picture_starts(&one);
    let header = &one[..first_gop_offset(&one)];
    let mut splitter = Mpeg2GopStream::with_split_groups(true);
    let units = split_into_units(&mut splitter, &[(&one.repeat(2), 0)]);

    let types: Vec<Vec<PictureType>> = units.iter().map(picture_types).collect();
    let group = vec![
        vec![I, P, B, B],
        vec![P, B, B],
        vec![P, B, B],
        vec![P, B, B],
        vec![P, B],
    ];
    assert_eq!(types, [group.clone(), group].concat());
    assert_eq!(
        units
            .iter()
            .map(|unit| unit.continues_group)
            .collect::<Vec<_>>(),
        [false, true, true, true, true].repeat(2)
    );

    // A unit in the middle of a group is the sequence header put in front of
    // the pictures, which are the source's own bytes.
    let second = &units[1];
    assert_eq!(
        second.data,
        [header, &one[starts[4]..starts[7]]].concat(),
        "no group header, and the pictures are untouched"
    );
    let continuing = parse_elementary_stream(&second.data).expect("parses");
    assert!(continuing.iter().all(|picture| !picture.starts_gop));
    assert!(parse_elementary_stream(&units[0].data).expect("parses")[0].starts_gop);
}

#[test]
fn a_unit_cut_from_a_group_has_a_timestamp_only_where_a_pes_begins() {
    let one = read_fixture("ibbp.m2v");
    let starts = picture_starts(&one);

    // One PES per picture, so every unit begins where a timestamp does.
    let mut bounds = vec![0];
    bounds.extend_from_slice(&starts[1..]);
    bounds.push(one.len());
    let chunks: Vec<(&[u8], u64)> = bounds
        .windows(2)
        .enumerate()
        .map(|(index, pair)| (&one[pair[0]..pair[1]], 1_000 + index as u64 * 100))
        .collect();
    let units = split_into_units(&mut Mpeg2GopStream::with_split_groups(true), &chunks);
    assert_eq!(
        units.iter().map(|unit| unit.pts).collect::<Vec<_>>(),
        [0, 4, 7, 10, 13]
            .iter()
            .map(|&picture| Some(1_000 + picture * 100))
            .collect::<Vec<_>>()
    );

    // One PES for the whole group: the timestamp that covers a later unit
    // belongs to the picture the group opens with.
    let units = split_into_units(
        &mut Mpeg2GopStream::with_split_groups(true),
        &[(&one, 1_000)],
    );
    assert_eq!(
        units.iter().map(|unit| unit.pts).collect::<Vec<_>>(),
        vec![Some(1_000), None, None, None, None]
    );
}

#[test]
fn leaves_a_group_without_b_pictures_whole() {
    let stream = read_fixture("ip.m2v").repeat(3);
    let whole = split_into_units(&mut Mpeg2GopStream::new(), &[(&stream, 0)]);
    let split = split_into_units(
        &mut Mpeg2GopStream::with_split_groups(true),
        &[(&stream, 0)],
    );
    assert_eq!(whole.len(), 6);
    assert_eq!(
        split.iter().map(|unit| &unit.data).collect::<Vec<_>>(),
        whole.iter().map(|unit| &unit.data).collect::<Vec<_>>()
    );
    assert!(split.iter().all(|unit| !unit.continues_group));
}

/// A picture header and one slice, with the bytes the splitter reads and
/// nothing else: it looks at start codes and the coding type, and decodes
/// nothing.
fn stub_picture(temporal_reference: u16, coding_type: u8) -> Vec<u8> {
    vec![
        0,
        0,
        1,
        0x00,
        (temporal_reference >> 2) as u8,
        ((temporal_reference & 3) << 6) as u8 | coding_type << 3 | 0x07,
        0xff,
        0xf8,
        0,
        0,
        1,
        0x01,
        0x55,
        0x55,
        0x55,
    ]
}

#[test]
fn keeps_the_two_fields_of_an_anchor_frame_together() {
    // Coding types in decode order: an I field with its P field, two B frames
    // as field pairs, a P pair, and two more B pairs. Only the pair that
    // follows a B picture starts a unit.
    let sequence = [
        0, 0, 1, 0xb3, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf1,
    ];
    let group = [0, 0, 1, 0xb8, 0x11, 0x22, 0x33, 0x44];
    let types = [1, 2, 3, 3, 3, 3, 2, 2, 3, 3];
    let mut es = [sequence.as_slice(), group.as_slice()].concat();
    for (index, coding_type) in types.into_iter().enumerate() {
        es.extend(stub_picture(index as u16, coding_type));
    }
    // The next group, which is what closes the first.
    es.extend_from_slice(&sequence);
    es.extend_from_slice(&group);
    es.extend(stub_picture(0, 1));

    let units = split_into_units(&mut Mpeg2GopStream::with_split_groups(true), &[(&es, 0)]);
    let coding_types = |unit: &Mpeg2Gop| -> Vec<u8> {
        picture_starts(&unit.data)
            .iter()
            .map(|&at| (unit.data[at + 5] >> 3) & 7)
            .collect()
    };
    assert_eq!(
        units.iter().map(coding_types).collect::<Vec<_>>(),
        vec![vec![1, 2, 3, 3, 3, 3], vec![2, 2, 3, 3], vec![1]]
    );
}

#[test]
fn does_not_cut_in_the_rest_of_a_group_after_a_gap() {
    use PictureType::{B, I, P};
    let one = read_fixture("ibbp.m2v");
    let starts = picture_starts(&one);
    let mut splitter = Mpeg2GopStream::with_split_groups(true);
    let mut units = splitter.push(&one[..starts[8]], None);
    // The tail of the group arrives after the gap, with picture starts of every
    // kind in it, and none of it is a unit: what it follows was lost.
    splitter.discard_pending();
    units.extend(splitter.push(&one[starts[8]..], None));
    units.extend(splitter.push(&one, None));
    units.extend(splitter.finish());

    let types: Vec<Vec<PictureType>> = units.iter().map(picture_types).collect();
    assert_eq!(
        types,
        vec![
            vec![I, P, B, B],
            vec![P, B, B],
            // The group opened after the tail, which is cut as any other.
            vec![I, P, B, B],
            vec![P, B, B],
            vec![P, B, B],
            vec![P, B, B],
            vec![P, B],
        ]
    );
    assert!(!units[2].continues_group);
}

// ---------------------------------------------------------------- decode mode

/// Run a stream in decode mode and on the passthrough path it has to agree
/// with, and check that it does.
fn assert_decode_mode_agrees(label: &str, stream: &[u8], options: TranscodeOptions) {
    let decoded = run_session_with_options(stream, 64 * 1024, decoding(options));
    let muxed = run_session_with_options(stream, 64 * 1024, passthrough_like_decode(options));
    assert_decode_matches_passthrough(label, &decoded, &muxed);
}

/// Copies of a fixture, one PES each stamped where it plays, with sound.
fn fixture_with_sound(name: &str, copies: u64, base: u64) -> Vec<u8> {
    let one = read_fixture(name);
    let timeline = mpeg2toh264::mpeg2_video_timeline(&one, false, &[]).expect("a timeline");
    let frames = parse_elementary_stream(&one).expect("parses").len() as u64;
    let group = frames * u64::from(timeline.sample_duration);
    let groups: Vec<(&[u8], u64, u64)> = (0..copies)
        .map(|copy| (one.as_slice(), base + copy * group, group))
        .collect();
    mux_with_sound(&groups)
}

#[test]
fn decode_mode_is_the_passthrough_timeline_without_the_video() {
    let mut streams: Vec<(String, Vec<u8>)> = vec![
        ("interleaved".into(), av_stream(6, 400)),
        ("timed".into(), timed_av_stream(10)),
        (
            "open gop".into(),
            fixture_with_sound("open_gop_leading_bb.m2v", 3, 900_000),
        ),
    ];
    for name in FIXTURES {
        streams.push((name.into(), fixture_with_sound(name, 4, 900_000)));
    }
    for (name, stream) in &streams {
        for open_gop_recovery in [OpenGopRecovery::RecoveryPoint, OpenGopRecovery::Discard] {
            let options = TranscodeOptions {
                open_gop_recovery,
                recovery_interval: 2,
                ..TranscodeOptions::default()
            };
            assert_decode_mode_agrees(&format!("{name}, {open_gop_recovery:?}"), stream, options);
        }
    }
}

#[test]
fn decode_mode_holds_over_holes_and_keeps_a_group_in_place_after_one() {
    let stream = timed_av_stream(10);
    let packets = stream.len() / 188;
    let lossy = with_packets_dropped(&stream, packets / 2, packets / 20);
    assert_decode_mode_agrees("a hole", &lossy, TranscodeOptions::default());
    // Single packets inside groups, which leave later units of the group
    // lagging behind its display clock.
    let mut cases = 0;
    for at in (packets / 3..packets * 2 / 3).step_by(41) {
        let lossy = with_packets_dropped(&stream, at, 1);
        assert_decode_mode_agrees(
            &format!("packet {at} lost"),
            &lossy,
            TranscodeOptions::default(),
        );
        cases += 1;
    }
    assert!(cases > 4);
}

#[test]
fn decode_mode_leaves_a_join_and_a_wrap_where_the_source_has_them() {
    const JUMP: u64 = 120 * 90_000;
    let one = read_fixture("ibbp.m2v");
    let group = parse_elementary_stream(&one).expect("parses").len() as u64 * (90_000 / 25);
    let groups: Vec<(&[u8], u64, u64)> = (0..6u64)
        .map(|copy| {
            let jump = if copy >= 3 { JUMP } else { 0 };
            (one.as_slice(), 900_000 + copy * group + jump, group)
        })
        .collect();
    let joined = mux_with_sound(&groups);
    assert_decode_mode_agrees("a join", &joined, TranscodeOptions::default());
    let decoded =
        run_session_with_options(&joined, 64 * 1024, decoding(TranscodeOptions::default()));
    let times: Vec<f64> = decoded
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Video { pictures, .. } => Some(pictures.iter().map(|picture| picture.time)),
            _ => None,
        })
        .flatten()
        .collect();
    let mut sorted = times.clone();
    sorted.sort_by(f64::total_cmp);
    let widest = sorted
        .windows(2)
        .map(|pair| pair[1] - pair[0])
        .fold(0.0, f64::max);
    assert!(
        (widest - JUMP as f64 / 90_000.0).abs() < 0.1,
        "the widest step between pictures is {widest}s"
    );

    let wrapped = timed_av_stream_from(6, (1u64 << 33) - group * 2);
    assert_decode_mode_agrees("a wrap", &wrapped, TranscodeOptions::default());
}

#[test]
fn decode_mode_describes_new_sound_again() {
    let stream = audio_change_stream(8, 90, 90);
    assert_decode_mode_agrees("a new configuration", &stream, TranscodeOptions::default());
    let decoded =
        run_session_with_options(&stream, 64 * 1024, decoding(TranscodeOptions::default()));
    assert_eq!(
        init_segments(&decoded).len(),
        2,
        "one description per configuration"
    );
}

#[test]
fn decode_mode_refuses_a_stream_without_aac_sound() {
    let mut session = Session::new(decoding(TranscodeOptions::default()));
    let stream = video_only_stream(3);
    let mut result = Ok(Vec::new());
    for chunk in stream.chunks(64 * 1024) {
        result = session.push(chunk);
        if result.is_err() {
            break;
        }
    }
    if result.is_ok() {
        result = session.finish();
    }
    let error = result.expect_err("decode mode needs sound");
    assert!(error.is_no_aac_audio(), "{error}");

    // Nothing came out before the refusal.
    let mut session = Session::new(decoding(TranscodeOptions::default()));
    let first = stream
        .chunks(188 * 4)
        .find_map(|chunk| match session.push(chunk) {
            Ok(fragments) => {
                assert!(fragments.is_empty(), "nothing goes out before the refusal");
                None
            }
            Err(error) => Some(error),
        });
    assert!(first.is_some_and(|error| error.is_no_aac_audio()));
}

#[test]
fn decode_mode_does_not_depend_on_chunking_or_on_the_deferred_calls() {
    let stream = timed_av_stream(8);
    let options = decoding(TranscodeOptions::default());
    let whole = fragments_digest(&run_session_with_options(&stream, stream.len(), options));
    for chunk in [188, 1000, 64 * 1024] {
        assert_eq!(
            fragments_digest(&run_session_with_options(&stream, chunk, options)),
            whole,
            "chunks of {chunk}"
        );
    }
    let mut session = Session::new(options);
    let mut deferred = Vec::new();
    for chunk in stream.chunks(7 * 188) {
        let mut progress = session.push_deferred(chunk).expect("push");
        assert!(matches!(progress, Progress::Idle(_)), "nothing to convert");
        deferred.extend(progress.fragments());
    }
    loop {
        let mut progress = session.finish_deferred().expect("finish");
        assert!(matches!(progress, Progress::Idle(_)), "nothing to convert");
        let fragments = progress.fragments();
        if fragments.is_empty() {
            break;
        }
        deferred.extend(fragments);
    }
    assert_eq!(fragments_digest(&deferred), whole, "the deferred calls");
}
