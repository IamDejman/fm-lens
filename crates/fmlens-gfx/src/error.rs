use std::fmt;

/// Why a picture or the game's catalog could not be read.
#[derive(Debug)]
pub enum Error {
    /// A file could not be opened or read.
    Io(std::io::Error),
    /// A file is not in the layout this reader knows, or is cut short or damaged.
    Format(&'static str),
    /// A valid file that uses something this reader does not handle, such as a new texture format.
    Unsupported(String),
    /// The PNG could not be written.
    Encode(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "could not read the game files: {e}"),
            Self::Format(what) => write!(f, "unexpected game file layout: {what}"),
            Self::Unsupported(what) => write!(f, "not supported: {what}"),
            Self::Encode(what) => write!(f, "could not write the picture: {what}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

pub(crate) type Result<T> = std::result::Result<T, Error>;
