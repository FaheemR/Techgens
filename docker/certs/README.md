# Extra CA certificates (optional)

If you build the images through your organisation's npm mirror or proxy and it uses a private certificate
authority, put that CA certificate here as a PEM file ending in `.crt` (for example `corp-root-ca.crt`).
It is trusted only while the images are built. `*.crt` / `*.pem` files in this folder are git-ignored.
