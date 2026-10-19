import math
import struct
import zlib
import os

def create_png(width, height, get_pixel_func):
    """Generates an RGBA PNG from a pixel callback."""
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([int(r), int(g), int(b), int(a)])

    compressed = zlib.compress(bytes(raw_data), 9)

    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    png = bytearray(b'\x89PNG\r\n\x1a\n')
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr_data))
    png.extend(chunk(b'IDAT', compressed))
    png.extend(chunk(b'IEND', b''))
    return bytes(png)

def draw_speedgps_icon(x, y, w, h):
    # Normalized coords: -1 to 1 with center at (0, 0)
    cx, cy = w / 2.0, h / 2.0
    nx = (x - cx) / (w / 2.0)
    ny = (y - cy) / (h / 2.0)
    dist = math.sqrt(nx * nx + ny * ny)

    # Base background: Solid pure White #FFFFFF
    r, g, b, a = 255, 255, 255, 255

    # Outer rounded icon border / subtle shadow zone (for maskable icon & iOS home screen)
    # The canvas is white, everything inside is crisp.

    # 1. Subtle circular track / ring in light gray #F3F4F6
    # Radius between 0.65 and 0.82
    angle = math.atan2(ny, nx)  # -pi to pi

    # Gauge arc spans from -140 deg (-2.44 rad) to +40 deg (+0.70 rad)
    # or from bottom-left around to bottom-right
    # Let speedometer be open at bottom: angle from 0.75*pi (135 deg) around to 0.25*pi (45 deg)
    # in standard screen coords (y down):
    # top is -pi/2 (-90 deg), right is 0, bottom is +pi/2 (+90 deg), left is pi.
    # Open gauge: gap at the bottom between 60 deg and 120 deg (1.05 rad to 2.09 rad)
    in_gauge_gap = 1.0 < angle < 2.14

    track_r_in = 0.64
    track_r_out = 0.80

    if track_r_in <= dist <= track_r_out and not in_gauge_gap:
        # Gauge Track: Light Gray #E5E7EB
        r, g, b = 229, 231, 235

        # Active speed portion: from 135 deg around top to -30 deg
        # in angle terms: angle > 2.14 (left bottom) or angle < -0.4 (top right)
        is_active = (angle > 2.14 or angle < 0.2)
        if is_active:
            # Gradient Vibrant Orange: #F97316 to #EA580C
            # Blend based on progress
            r, g, b = 249, 115, 22

    # 2. Sleek dynamic speedometer needle / navigation arrow pointing top-right (approx -40 deg)
    # Needle pivot at (0, 0) pointing towards (0.50, -0.45)
    needle_angle = -0.72  # ~-41 degrees (pointing fast top-right)
    # Rotate coords to needle local space:
    cos_a = math.cos(-needle_angle)
    sin_a = math.sin(-needle_angle)
    lx = nx * cos_a - ny * sin_a  # along needle
    ly = nx * sin_a + ny * cos_a  # perpendicular to needle

    # Needle shape: arrowhead / tapered polygon from lx = -0.15 to lx = 0.58, width tapering
    if -0.12 <= lx <= 0.58:
        # Width half
        if lx < 0:
            half_w = 0.08 * (1.0 + lx / 0.12)
        else:
            half_w = 0.08 * (1.0 - lx / 0.58)

        if abs(ly) <= half_w:
            # Needle color: Modern Dark Charcoal #171717 with orange highlight
            if ly > 0:
                r, g, b = 23, 23, 23      # #171717
            else:
                r, g, b = 45, 45, 45      # faceted 3D shade

    # 3. Center pivot hub (circle) with brand orange dot
    if dist <= 0.15:
        # Dark outer ring
        r, g, b = 23, 23, 23
    if dist <= 0.085:
        # Brand Vibrant Orange dot #F97316
        r, g, b = 249, 115, 22

    return (r, g, b, a)

def main():
    os.makedirs('public/icons', exist_ok=True)

    sizes = [
        (192, 192, 'public/icons/icon-192.png'),
        (512, 512, 'public/icons/icon-512.png'),
        (180, 180, 'public/apple-touch-icon.png'),
    ]

    for w, h, path in sizes:
        png_bytes = create_png(w, h, draw_speedgps_icon)
        with open(path, 'wb') as f:
            f.write(png_bytes)
        print(f"Generated {path} ({w}x{h}, {len(png_bytes)} bytes)")

if __name__ == '__main__':
    main()
