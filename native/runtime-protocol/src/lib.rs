#![no_std]

pub const MAGIC: [u8; 4] = *b"NXOS";
pub const PROTOCOL_VERSION: u16 = 1;
pub const HEADER_LENGTH: usize = 16;
pub const MAX_PAYLOAD_LENGTH: u32 = 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum FrameKind {
    Request = 1,
    Response = 2,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FrameHeader {
    pub kind: FrameKind,
    pub request_id: u32,
    pub payload_length: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DecodeError {
    Truncated,
    InvalidMagic,
    UnsupportedVersion,
    InvalidKind,
    PayloadTooLarge,
}

impl FrameHeader {
    pub fn decode(bytes: &[u8]) -> Result<Self, DecodeError> {
        if bytes.len() < HEADER_LENGTH {
            return Err(DecodeError::Truncated);
        }
        if bytes[0..4] != MAGIC {
            return Err(DecodeError::InvalidMagic);
        }
        if u16::from_be_bytes([bytes[4], bytes[5]]) != PROTOCOL_VERSION {
            return Err(DecodeError::UnsupportedVersion);
        }
        let kind = match bytes[6] {
            1 => FrameKind::Request,
            2 => FrameKind::Response,
            _ => return Err(DecodeError::InvalidKind),
        };
        let request_id = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        let payload_length = u32::from_be_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]);
        if payload_length > MAX_PAYLOAD_LENGTH {
            return Err(DecodeError::PayloadTooLarge);
        }
        Ok(Self { kind, request_id, payload_length })
    }

    pub fn encode(&self, output: &mut [u8; HEADER_LENGTH]) -> Result<(), DecodeError> {
        if self.payload_length > MAX_PAYLOAD_LENGTH {
            return Err(DecodeError::PayloadTooLarge);
        }
        output[0..4].copy_from_slice(&MAGIC);
        output[4..6].copy_from_slice(&PROTOCOL_VERSION.to_be_bytes());
        output[6] = self.kind as u8;
        output[7] = 0;
        output[8..12].copy_from_slice(&self.request_id.to_be_bytes());
        output[12..16].copy_from_slice(&self.payload_length.to_be_bytes());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_round_trip() {
        let expected = FrameHeader {
            kind: FrameKind::Request,
            request_id: 42,
            payload_length: 512,
        };
        let mut bytes = [0_u8; HEADER_LENGTH];
        expected.encode(&mut bytes).unwrap();
        assert_eq!(FrameHeader::decode(&bytes), Ok(expected));
    }
}
