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
