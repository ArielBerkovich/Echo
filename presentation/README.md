# Echo integration possibilities deck

This folder contains the generated presentation, its high-resolution slide
renders, and the source used to build it.

## Output

- `output/Echo_Integration_Possibilities.pptx` — PowerPoint presentation
- `output/contact-sheet.png` — visual overview of all slides
- `rendered/*.png` — individual 1600×900 slide previews
- `rendered/*.svg` — vector slide sources

## Rebuild

ImageMagick is required for SVG-to-PNG rendering.

```bash
npm install --prefix presentation
npm --prefix presentation run build
```

The presentation uses the current Echo logo and a UI composition based on the
actual Echo workspace design.

The Garp fanart was supplied through this user-selected Pinterest reference:

https://www.pinterest.com/pin/garp-fanart--578501514655029831/

It is included for this internal concept presentation with a visible source
credit and hyperlink on the AI integration slide.
