from PIL import Image, ImageDraw, ImageFont
import os

# Create a 24x24 PNG icon
size = 24
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw a simple "C" shape
# Outer arc
draw.arc([4, 4, 20, 20], start=45, end=315, fill=(0, 122, 204), width=3)

# Small dot
draw.ellipse([17, 5, 21, 9], fill=(255, 107, 53))

# Save as PNG
img.save('/Users/pedroazevedo/workspace/claude-projects/VersionPlanExtension/assets/claude-icon.png')
print("PNG icon created successfully!")