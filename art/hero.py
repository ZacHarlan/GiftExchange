"""Header art: a cluster of wrapped presents and glass ornaments -> hero.png (wide)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403
import gift  # noqa: E402  (reuses its paper/ribbon/bow builders; its renders only run as __main__)

OUT = out_dir()


def closed_gift(paper, ribbon, W=1.5, H=1.05):
    objs = []
    box = cube("Box", (W, W, H), (0, 0, H / 2), bevel=0.025)
    assign(box, paper)
    objs.append(box)
    lid_h = 0.28
    lid_z = H + lid_h / 2 - 0.12
    lid = cube("Lid", (W + 0.08, W + 0.08, lid_h), (0, 0, lid_z), bevel=0.03)
    assign(lid, paper)
    objs.append(lid)
    for sx, sy in ((0.2, W + 0.012), (W + 0.012, 0.2)):
        band = cube("Band", (sx, sy, H - 0.02), (0, 0, H / 2), bevel=0.005)
        assign(band, ribbon)
        lband = cube("LidBand", (sx if sx < 1 else W + 0.092, sy if sy < 1 else W + 0.092, lid_h + 0.012),
                     (0, 0, lid_z), bevel=0.005)
        assign(lband, ribbon)
        objs += [band, lband]
    objs += gift.bow(lid_z + lid_h / 2, ribbon)
    return objs


def place(objs, loc, rot_z, scale):
    root = bpy.data.objects.new("GiftRoot", None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    root.location = loc
    root.rotation_euler = (0, 0, deg(rot_z))
    root.scale = scale
    return root


def ornament(loc, radius, color, metallic=True):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=96, ring_count=48)
    ball = smooth(bpy.context.object)
    m = principled("Ornament", color, metallic=1.0 if metallic else 0.0, roughness=0.08, coat=1.0, coat_rough=0.02)
    assign(ball, m)
    cap = cylinder("Cap", radius * 0.22, radius * 0.22, (loc[0], loc[1], loc[2] + radius * 0.98), verts=48, bevel=0.01)
    assign(cap, gold("Cap", roughness=0.3))
    bpy.ops.mesh.primitive_torus_add(major_radius=radius * 0.1, minor_radius=radius * 0.025,
                                     location=(loc[0], loc[1], loc[2] + radius * 1.18), rotation=(deg(90), 0, 0))
    assign(bpy.context.object, gold("Loop", roughness=0.3))


reset()
setup_render(res=1400, samples=192)
s = bpy.context.scene
s.render.resolution_x, s.render.resolution_y = 1600, 760

crimson = (gift.wrapping_paper((0.36, 0.008, 0.025), (1.0, 0.7, 0.25), "Crimson"), gift.satin("GoldRibbon", (1.0, 0.68, 0.18)))
emerald = (gift.wrapping_paper((0.01, 0.16, 0.06), (1.0, 0.75, 0.3), "Emerald", scale=12), gift.satin("RedRibbon", (0.7, 0.02, 0.05)))
royal = (gift.wrapping_paper((0.02, 0.06, 0.38), (0.85, 0.87, 0.92), "Royal", scale=11), gift.satin("SilverRibbon", (0.9, 0.92, 0.96)))

place(closed_gift(*crimson), (0, 0.3, 0), -18, (1.0, 1.0, 1.08))
place(closed_gift(*emerald), (-2.0, -0.2, 0), 22, (0.82, 0.82, 0.7))
place(closed_gift(*royal), (1.95, -0.25, 0), -40, (0.7, 0.7, 0.85))

ornament((-0.95, -1.35, 0.32), 0.32, (0.85, 0.06, 0.08))
ornament((1.0, -1.45, 0.26), 0.26, (1.0, 0.72, 0.25))
ornament((3.05, -1.0, 0.22), 0.22, (0.75, 0.78, 0.85))
ornament((-3.0, -1.05, 0.24), 0.24, (0.05, 0.35, 0.15))

shadow_catcher(size=30)
studio(target=(0, 0, 0.7), scale=1.2)
camera((0.4, -9.5, 3.4), (0, 0, 0.8), lens=50)
render(os.path.join(OUT, "hero.png"))
