# Skateboard Ninjas

A playable HTML5 2D side-scrolling skateboarding prototype. Built with Canvas 2D, CSS, and vanilla JavaScript modules.

## Run locally
Because this project uses JavaScript ES modules, open it through a local HTTP server rather than double-clicking `index.html`.

If Python is installed, open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls
- **Space / Up Arrow / OLLIE button:** Jump
- **Flip joystick:** Up = Kickflip, Down = Heelflip, Left = Pop Shove-it, Right = 360 Shove-it
- **Grab joystick:** Up = Indy, Down = Tail, Left = Melon, Right = Nose grab
- **A / D:** Melon/Nose grab (keyboard fallback)
- **Escape / P:** Pause
- Land on a rail while descending to grind automatically; ollie while grinding to pop off.

## GitHub Pages
Upload the contents of this folder to a repository and enable GitHub Pages for the branch/folder containing `index.html`. The game uses relative paths and does not require a build step or backend.

## Notes
This is a first playable prototype using procedural Canvas art and simple arcade physics. Tune gameplay values in `src/main.js` under `CONFIG`. Visual art, sound effects, deeper trick animation, and additional level segments can be added without changing the basic project structure.
