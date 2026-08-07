# CTRLbot Title Card Background Gradient

The background seen in [`copy-130.png`](file:///C:/0-Repo/1%20-%20CTRLbot.av/CTRLbot-Remotion/out/copy-130.png) was not stored as a static image asset in the repository. Instead, it is procedurally rendered in CSS by the [`BrandCard`](file:///C:/0-Repo/1%20-%20CTRLbot.av/CTRLbot-Remotion/src/scenes/BrandCard.tsx) component.

---

## Clean Image Renders

Standalone PNG images of **just the gradient background** (with all logo and text elements removed) have been rendered and saved to the [`out/`](file:///C:/0-Repo/1%20-%20CTRLbot.av/CTRLbot-Remotion/out/) directory:

- 📱 **Portrait (1080 × 1920):** [`out/gradient-background-portrait.png`](file:///C:/0-Repo/1%20-%20CTRLbot.av/CTRLbot-Remotion/out/gradient-background-portrait.png)
- 🖥️ **Landscape (1920 × 1080):** [`out/gradient-background-landscape.png`](file:///C:/0-Repo/1%20-%20CTRLbot.av/CTRLbot-Remotion/out/gradient-background-landscape.png)

![Portrait Gradient](/C:/Users/natmu/.gemini/antigravity-cli/brain/d63d3150-4b36-4382-bdb2-340b390f7be1/gradient-background-portrait.png)

---

## Technical CSS Specification (Pronounced Version)

The setup area uses a more pronounced version of the brand gradient to ensure visibility across different panel types (Phone/Tablet).

```css
background-color: #000000;
background-image: radial-gradient(
  100% 100% at 68% 32%,
  rgba(0, 143, 212, 0.45) 0%,
  rgba(0, 0, 0, 0) 90%
);
```

### Key Parameters:
- **Base Color:** `#000000` (Solid Void Black)
- **Gradient Wash Color:** `rgba(0, 143, 212, 0.45)` (CTRLbot Blue `#008FD4` at 45% opacity)
- **Position Center:** `68%` X (from left), `32%` Y (from top)
- **Radius:** `100%` (covers more area for better visibility)
- **Fade Stop:** `90%` (gradual fade to edges)
