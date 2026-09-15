# Build resources

electron-builder reads this folder (`buildResources` in `electron-builder.yml`).

The app uses `icon.ico`: the DeviceLab device head split vertically, white on black
on the left and black on white on the right. `icon.png` is the source artwork.
The ICO includes 16/24/32/48/64/128/256 pixel sizes for Windows shortcuts.

Build artwork:

| File | Used for |
| --- | --- |
| `icon.ico` | App icon and installer icon. 256×256 minimum; include 16/32/48/64/128/256 sizes. |
| `installerIcon.ico` | Installer-only icon, if you want it different from the app's. |
| `installerHeader.bmp` | NSIS header image, 150×57. |
| `installerSidebar.bmp` | NSIS welcome/finish sidebar, 164×314. |

The shortcut script also uses `icon.ico` so shortcuts to older builds get the new artwork.
