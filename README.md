# LinuxZ

LinuxZ is a DayZ launcher built with Tauri, Vite, React, TypeScript, and Rust.

## Build On Arch Linux

1. Install the Arch build dependencies:

   ```bash
   sudo pacman -Syu
   sudo pacman -S --needed \
     base-devel \
     git \
     gtk3 \
     webkit2gtk-4.1 \
     libappindicator \
     nodejs \
     pnpm \
     rust
   ```

2. Build and install it with `makepkg`:

   ```bash
   cd packaging/arch
   makepkg -si
   ```

The included [`PKGBUILD`](./packaging/arch/PKGBUILD) builds from the current checkout, compiles the Tauri app without distro-specific bundle targets, and installs a launcher wrapper plus the `libsteam_api.so` runtime library the binary needs on Arch. The frontend is still pinned to Node 22 in `.node-version`, but newer Arch `nodejs` releases currently build the app as well.

## Scripts

- `pnpm install`
- `pnpm dev`
- `pnpm test`
- `pnpm tauri:dev`
- `pnpm tauri:build`

## Notes

- The frontend is pinned to Node 22 LTS even though newer versions may work locally.
- LinuxZ currently targets Linux only.
- Workshop auto-subscribe.
