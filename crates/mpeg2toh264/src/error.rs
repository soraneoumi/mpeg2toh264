use std::fmt;

/// Anything that stops a session or a decode, carrying the message the caller
/// sees.
///
/// The failures here are all "this stream is not something we can handle".
/// One of them a caller acts on: a stream without AAC sound cannot be played
/// in decode mode but can be carried through in passthrough mode, so that one
/// can be told apart.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    message: String,
    no_aac_audio: bool,
}

impl Error {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            no_aac_audio: false,
        }
    }

    /// The stream carries no AAC sound for decode mode to play the pictures
    /// against.
    pub fn no_aac_audio() -> Self {
        Self {
            message: "the stream has no AAC audio, which decode mode needs as its clock".into(),
            no_aac_audio: true,
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn is_no_aac_audio(&self) -> bool {
        self.no_aac_audio
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

macro_rules! bail {
    ($($arg:tt)*) => {
        return Err($crate::Error::new(format!($($arg)*)))
    };
}

pub(crate) use bail;
