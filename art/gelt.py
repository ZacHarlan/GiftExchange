"""Chocolate gelt in crinkled gold foil -> gelt.png (stack + scattered) and gelt-coin.png (single coin)."""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403

OUT = out_dir()
random.seed(3)


def foil(name, tint):
    m = gold(name, roughness=0.18, tint=tint)
    add_bump(m, scale=22, strength=0.35, detail=8, distortion=2.0)
    return m


def star_of_david(z, r, mat, parent_loc):
    """Raised six-point star pressed into the foil."""
    objs = []
    for rot in (0, 60):
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=0.025, vertices=3,
                                            location=(parent_loc[0], parent_loc[1], z))
        t = bpy.context.object
        t.rotation_euler = (0, 0, deg(90 + rot))
        sol = t.modifiers.new("Wire", "WIREFRAME")
        sol.thickness = r * 0.16
        sol.use_even_offset = True
        smooth(t)
        assign(t, mat)
        objs.append(t)
    return objs


def coin(loc, rot, mat, star=True, r=0.42):
    c = cylinder("Coin", r, 0.075, loc, verts=96, bevel=0.03)
    c.rotation_euler = rot
    # Raised rim.
    bpy.ops.mesh.primitive_torus_add(major_radius=r - 0.035, minor_radius=0.022,
                                     location=(0, 0, 0.0375), major_segments=96, minor_segments=16)
    rim = bpy.context.object
    rim.parent = c
    assign(rim, mat)
    smooth(rim)
    assign(c, mat)
    if star:
        for t in star_of_david(0.04, r * 0.45, mat, (0, 0)):
            t.parent = c
    return c


def scene(single=False):
    reset()
    setup_render(res=640, samples=160)
    gold_foil = foil("GoldFoil", (1.0, 0.72, 0.26))
    silver_foil = foil("SilverFoil", (0.85, 0.86, 0.9))
    if single:
        coin((0, 0, 0.6), (deg(68), deg(8), deg(25)), gold_foil, r=0.5)
        studio(target=(0, 0, 0.6))
        camera((0, -4.2, 1.0), (0, 0, 0.6), lens=75)
        return
    # Leaning stack.
    for i in range(7):
        coin((0.03 * random.uniform(-1, 1), 0.03 * random.uniform(-1, 1), 0.04 + i * 0.078),
             (deg(random.uniform(-2, 2)), deg(random.uniform(-2, 2)), deg(random.uniform(0, 360))),
             gold_foil if i % 3 else silver_foil, star=(i == 6))
    # Scattered coins.
    scatter = [((-0.95, -0.35, 0.04), (0, 0, 0.3), gold_foil), ((0.85, -0.55, 0.04), (0, 0, 1.2), gold_foil),
               ((0.7, 0.45, 0.14), (deg(28), deg(4), 2.0), silver_foil), ((-0.6, 0.55, 0.04), (0, 0, 0.8), gold_foil),
               ((-0.35, -0.85, 0.15), (deg(-30), deg(10), 0.4), gold_foil)]
    for loc, rot, m in scatter:
        coin(loc, rot, m)
    shadow_catcher()
    studio(target=(0, 0, 0.25))
    camera((2.6, -3.4, 2.7), (0, -0.05, 0.25), lens=55)


scene()
render(os.path.join(OUT, "gelt.png"))
scene(single=True)
render(os.path.join(OUT, "gelt-coin.png"))
