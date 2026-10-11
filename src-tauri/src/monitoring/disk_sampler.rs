use crate::monitoring::metrics::DiskSample;
use sysinfo::Disks;

pub trait BootVolumeReader {
    fn boot_volume(&self) -> DiskSample;
}

pub struct SysinfoDiskReader;

impl BootVolumeReader for SysinfoDiskReader {
    fn boot_volume(&self) -> DiskSample {
        read_boot_volume_with(|| {
            let mut disks = Disks::new_with_refreshed_list();
            disks.refresh(true);
            disks
        })
    }
}

pub fn read_boot_volume_with<F>(mut load: F) -> DiskSample
where
    F: FnMut() -> Disks,
{
    let disks = load();
    let boot = disks
        .iter()
        .find(|disk| disk.mount_point().to_str() == Some("/"))
        .or_else(|| disks.iter().next());

    match boot {
        Some(disk) => DiskSample {
            mount_point: disk
                .mount_point()
                .to_str()
                .unwrap_or("/")
                .to_string(),
            total_bytes: Some(disk.total_space()),
            available_bytes: Some(disk.available_space()),
        },
        None => DiskSample {
            mount_point: "/".into(),
            total_bytes: None,
            available_bytes: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::monitoring::metrics::DiskSample;

    struct FakeReader {
        sample: DiskSample,
    }

    impl BootVolumeReader for FakeReader {
        fn boot_volume(&self) -> DiskSample {
            self.sample.clone()
        }
    }

    #[test]
    fn fake_reader_returns_injected_disk_sample() {
        let reader = FakeReader {
            sample: DiskSample {
                mount_point: "/".into(),
                total_bytes: Some(100),
                available_bytes: Some(40),
            },
        };
        assert_eq!(reader.boot_volume().available_bytes, Some(40));
    }

    #[test]
    fn boot_volume_reads_root_on_macos() {
        if std::env::consts::OS != "macos" {
            return;
        }
        let sample = SysinfoDiskReader.boot_volume();
        assert_eq!(sample.mount_point, "/");
        assert!(sample.total_bytes.unwrap_or(0) > 0);
    }
}
