# Contributing

Thank you for your interest in the Wormhole Physics Playground.

## How to Contribute

### Reporting Issues
- Open a GitHub issue describing the problem
- Include the browser and OS you're using
- If a computation produces unexpected results, note which mode (traversal, wave
  propagation, stability, formation) and which parameters

### Scientific Feedback
We especially welcome feedback from:
- **General relativists** who can check the Morris–Thorne / Ellis metric implementation
- **Numerical-relativity people** who can assess the geodesic and field-propagation solvers
- **Anyone** who can point at an error in the exotic-matter or stability calculations

Please open an issue tagged `scientific-review` with your assessment.

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test in a browser (the playground has no build step) or run the Python scripts
5. Submit a pull request

### Where this ships
This repository is the **source of truth** for the live pages at
[brokenbranch.dev/labs/wormhole/](https://www.brokenbranch.dev/labs/wormhole/). The
site pull-mirrors `index.html`, `playground.html`, `README.md`, `js/`, `assets/og.png`
and the three `wormhole_wave_m*.png` figures from here once a day, verbatim. Nothing is
pushed from this repo and nothing is edited on the site side, so:

- What you merge into those files is what visitors see within a day. Keep the HTML
  `<head>` metadata (canonical URL, Open Graph, JSON-LD) intact.
- The site enforces `script-src 'self'`: no inline `<script>` blocks — page logic lives
  in `js/`.
- The remaining figures (`formation*`, `wormhole_embedding.png`, `wormhole_stability.png`,
  `wormhole_traversal.png`, `wormhole_wave.gif`) and the Python scripts stay here as the
  research record and are not served.

### Guidelines
- This is an exploratory project. Contributions should maintain intellectual honesty.
- If a computation produces results that challenge the current conclusions — for example,
  if you find a regime where the angular-momentum filtering breaks down — that's valuable.
  **Do not hide negative results.** The "you cannot create a wormhole classically" finding is
  the most important thing this repo says; results like it are the point.
- Keep the playground's zero-dependency philosophy. No frameworks, no build tools.
- Don't oversell. The exotic-matter requirement is a 46-orders-of-magnitude gap at a 1 m throat and the page
  should always say so.

## Code of Conduct

Be respectful, constructive, and honest. Extraordinary claims require extraordinary evidence.
Computational models are tools for sharpening questions, not for proving predetermined
conclusions.
