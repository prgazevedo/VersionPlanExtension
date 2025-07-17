#!/usr/bin/env python3
"""
Simple script to create an icon for the Claude Config Manager extension.
Creates a 128x128 PNG icon with "CC" text on a dark background.
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    # Create a 128x128 image with dark background
    size = (128, 128)
    background_color = (30, 30, 30)  # Dark gray
    text_color = (255, 255, 255)    # White
    
    # Create image
    img = Image.new('RGB', size, background_color)
    draw = ImageDraw.Draw(img)
    
    # Try to use a system font, fallback to default
    try:
        font = ImageFont.truetype("Arial.ttf", 60)
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 60)
        except:
            font = ImageFont.load_default()
    
    # Draw "CC" text centered
    text = "CC"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size[0] - text_width) // 2
    y = (size[1] - text_height) // 2
    
    draw.text((x, y), text, fill=text_color, font=font)
    
    # Add a subtle border
    draw.rectangle([0, 0, size[0]-1, size[1]-1], outline=(60, 60, 60), width=2)
    
    # Save the image
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(script_dir, 'icon.png')
    img.save(icon_path)
    
    print(f"Icon created successfully at: {icon_path}")
    
except ImportError:
    import os
    print("PIL (Pillow) not available. Creating a simple text placeholder.")
    # Create a simple text file as placeholder
    script_dir = os.path.dirname(os.path.abspath(__file__))
    placeholder_path = os.path.join(script_dir, 'icon-placeholder.txt')
    
    with open(placeholder_path, 'w') as f:
        f.write("Icon placeholder - Create a 128x128 PNG icon with 'CC' text on dark background\n")
        f.write("Suggested colors: Background #1e1e1e, Text #ffffff\n")
        f.write("Use any image editor to create icon.png in this directory\n")
    
    print(f"Placeholder created at: {placeholder_path}")
    print("Please create icon.png manually using an image editor.")