"""Header art: a decorated Christmas tree with wrapped presents underneath -> hero.png (wide)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403
import gift  # noqa: E402  (reuses its paper/ribbon/bow builders; its renders only run as __main__)

OUT = out_dir()


def closed_gift(paper, ribbon, W=1.5, H=1.05, loop_yaw=0.0):
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
    objs += gift.bow(lid_z + lid_h / 2, ribbon, loop_yaw=loop_yaw)
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


def needle_material():
    """Fir green; per-strand variation, lighter new-growth tips."""
    m = principled("Needles", (0.02, 0.11, 0.04), roughness=0.45, sheen=0.3)
    nt = m.node_tree
    info = nt.nodes.new("ShaderNodeHairInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.006, 0.05, 0.018, 1)
    ramp.color_ramp.elements[1].color = (0.04, 0.20, 0.06, 1)
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    mix.inputs[1].default_value = 0.5
    nt.links.new(info.outputs["Random"], mix.inputs[0])
    nt.links.new(info.outputs["Intercept"], mix.inputs[2])
    nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Base Color"])
    return m


TREE_BASE, TREE_TOP, TREE_R = 0.55, 4.8, 2.2


def surface_r(z):
    """Approximate radius of the tree's outer surface at height z."""
    return max(0.0, TREE_R * (TREE_TOP - z) / (TREE_TOP - TREE_BASE))


def tree(rng):
    """Layered fir: tiers of drooping fronds, furred with hair-particle needles."""
    branches = []  # (angle, tip position) for hanging ornaments
    tiers = 10
    fronds = []
    for k in range(tiers):
        f = k / tiers
        h = TREE_BASE + (TREE_TOP - TREE_BASE - 0.45) * f
        R = surface_r(h) * 1.04 + 0.1
        n = max(5, int(26 * R / TREE_R))
        off = rng.random() * 6.28
        for j in range(n):
            a = off + 2 * math.pi * j / n + rng.uniform(-0.12, 0.12)
            L = R * rng.uniform(0.86, 1.04)
            c, s_ = math.cos(a), math.sin(a)
            droop = 0.22 * L
            pts = [(0.03 * c, 0.03 * s_, h + 0.20), (0.4 * L * c, 0.4 * L * s_, h + 0.08),
                   (0.78 * L * c, 0.78 * L * s_, h - droop * 0.75), (L * c, L * s_, h - droop + 0.04)]
            side = Vector((-s_, c, 0))
            fronds.append(ribbon_strip("Frond", pts, 0.42 * L + 0.12, lambda t, p, T, w=side: w,
                                       scale_fn=lambda t: (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.15)) ** 0.8)
                                       if t < 0.87 else max(0.08, (1 - t) * 4.5),
                                       cup_fn=lambda t: 0.16, thickness=0.05, rows=18, cols=5))
            branches.append((a, Vector(pts[2]), L, h))
    # Leader: the upright tip the star sits on (two crossed fronds).
    for wdir in (Vector((1, 0, 0)), Vector((0, 1, 0))):
        fronds.append(ribbon_strip("Leader", [(0, 0, TREE_TOP - 0.75), (0, 0, TREE_TOP - 0.3), (0, 0, TREE_TOP)], 0.26,
                                   lambda t, p, T, w=wdir: w, scale_fn=lambda t: max(0.1, 1 - t ** 1.5),
                                   thickness=0.04, rows=10, cols=3))
    bpy.ops.object.select_all(action="DESELECT")
    for o in fronds:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fronds[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    t = bpy.context.object
    t.name = "Tree"
    needles = needle_material()
    assign(t, needles)
    # Needles.
    t.modifiers.new("Needles", "PARTICLE_SYSTEM")
    ps = t.particle_systems[0]
    ps.seed = 7
    pt = ps.settings
    pt.type = "HAIR"
    pt.count = 60000
    pt.hair_length = 0.13
    pt.emit_from = "FACE"
    pt.use_advanced_hair = False
    pt.child_type = "SIMPLE"
    pt.rendered_child_count = 5
    pt.child_length = 0.85
    pt.child_length_threshold = 0.4
    pt.child_radius = 0.05
    pt.root_radius = 1.0
    pt.tip_radius = 0.0
    pt.radius_scale = 0.012
    pt.material_slot = "Needles"
    trunk = cylinder("Trunk", 0.14, 1.2, (0, 0, 0.6), verts=32)
    assign(trunk, principled("Bark", (0.07, 0.035, 0.02), roughness=0.8))
    return branches


def ornament(loc, radius, color, metallic=True, hang_to=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=64, ring_count=32)
    ball = smooth(bpy.context.object)
    m = principled("Ornament", color, metallic=1.0 if metallic else 0.0, roughness=0.08, coat=1.0, coat_rough=0.02)
    assign(ball, m)
    cap = cylinder("Cap", radius * 0.22, radius * 0.22, (loc[0], loc[1], loc[2] + radius * 0.98), verts=32, bevel=0.01)
    assign(cap, gold("Cap", roughness=0.3))
    if hang_to is not None:
        top = Vector((loc[0], loc[1], loc[2] + radius * 1.08))
        wire = curve_tube("Hook", [tuple(top), tuple(Vector(hang_to))], 0.006, resolution=4)
        wire.data.materials.append(gold("Hook", roughness=0.3))


def light_string(rng, turns=4.2, bulbs=140):
    """Warm fairy lights spiralling round the tree, slightly sagging between turns."""
    glow = principled("Bulb", (1, 0.8, 0.5), emission=(1.0, 0.62, 0.25), emission_strength=22)
    for i in range(bulbs):
        f = (i + 0.5) / bulbs
        z = TREE_BASE + 0.25 + (TREE_TOP - TREE_BASE - 0.75) * f
        a = -math.pi / 2 + 2 * math.pi * turns * f
        r = surface_r(z) * rng.uniform(0.86, 1.02) + 0.04
        z += -0.08 * math.sin(a * 3) ** 2
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(r * math.cos(a), r * math.sin(a), z),
                                             segments=12, ring_count=8)
        b = bpy.context.object
        assign(b, glow)
        b.visible_shadow = False


def garland(turns=2.3):
    """Gold bead garland in swags round the tree."""
    import bmesh
    pts = []
    swags = int(turns * 7)
    for i in range(swags * 2 + 1):
        f = i / (swags * 2)
        z = TREE_BASE + 0.55 + (TREE_TOP - TREE_BASE - 1.5) * (1 - f)
        a = -math.pi / 2 - 0.9 + 2 * math.pi * turns * f
        sag = (i % 2) * 0.22
        r = surface_r(z - sag) + 0.04 + sag * 0.35
        pts.append((r * math.cos(a), r * math.sin(a), z - sag))
    line = spline_points(pts, 20)
    bm = bmesh.new()
    acc = 0.0
    for p, q in zip(line, line[1:]):
        acc += (q - p).length
        if acc >= 0.05:
            acc = 0.0
            bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.024,
                                      matrix=Matrix.Translation(q))
    me = bpy.data.meshes.new("Garland")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Garland", me)
    bpy.context.collection.objects.link(o)
    for poly in me.polygons:
        poly.use_smooth = True
    assign(o, gold("Beads", roughness=0.18))


def star(z):
    import bmesh
    bm = bmesh.new()
    outer, inner, depth = 0.42, 0.17, 0.1
    rim = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = outer if i % 2 == 0 else inner
        rim.append(bm.verts.new((r * math.cos(a), 0, r * math.sin(a))))
    front = bm.verts.new((0, -depth, 0))
    back = bm.verts.new((0, depth, 0))
    for i in range(10):
        bm.faces.new((rim[i], rim[(i + 1) % 10], front))
        bm.faces.new((rim[(i + 1) % 10], rim[i], back))
    me = bpy.data.meshes.new("Star")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Star", me)
    bpy.context.collection.objects.link(o)
    o.location = (0, 0, z)
    m = principled("StarGold", (1.0, 0.66, 0.2), metallic=1.0, roughness=0.2,
                   emission=(1.0, 0.6, 0.18), emission_strength=0.6)
    bevel = o.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    assign(o, m)
    point_light("StarGlow", (0, -0.4, z), 60, (1.0, 0.75, 0.4), radius=0.2)


from mathutils import Matrix  # noqa: E402
import random  # noqa: E402

reset()
setup_render(res=1400, samples=192)
s = bpy.context.scene
s.render.resolution_x, s.render.resolution_y = 1600, 760
rng = random.Random(12)

crimson = (gift.wrapping_paper((0.36, 0.008, 0.025), (1.0, 0.7, 0.25), "Crimson"), gift.satin("GoldRibbon", (1.0, 0.68, 0.18)))
emerald = (gift.wrapping_paper((0.01, 0.16, 0.06), (1.0, 0.75, 0.3), "Emerald", scale=12), gift.satin("RedRibbon", (0.7, 0.02, 0.05)))
royal = (gift.wrapping_paper((0.02, 0.06, 0.38), (0.85, 0.87, 0.92), "Royal", scale=11), gift.satin("SilverRibbon", (0.9, 0.92, 0.96)))
golden = (gift.wrapping_paper((0.55, 0.36, 0.08), (0.95, 0.95, 0.9), "Golden", scale=13), crimson[1].copy())
bsdf(golden[1]).inputs["Base Color"].default_value = (0.7, 0.02, 0.05, 1)
ivory = (gift.wrapping_paper((0.75, 0.72, 0.66), (0.8, 0.05, 0.07), "Ivory", scale=10), emerald[1])

TREE_Y = 0.9
branches = tree(rng)
light_string(rng)
garland()
star(TREE_TOP + 0.24)

# Ornaments hung from the branch tips, mostly on the side facing the camera.
palette = [((0.8, 0.04, 0.06), True), ((1.0, 0.72, 0.25), True), ((0.78, 0.8, 0.86), True),
           ((0.05, 0.12, 0.5), True), ((0.85, 0.04, 0.08), True), ((1.0, 0.72, 0.25), True)]
front = [b for b in branches if math.sin(b[0]) < -0.25]
rng.shuffle(front)
used = []
k = 0
for a, mid, L, h in front:
    tip = Vector((math.cos(a), math.sin(a), 0)) * (0.9 * L)
    tip.z = h - 0.2 * L
    r = 0.17 + 0.08 * min(1, L / TREE_R) + rng.uniform(-0.015, 0.015)
    if h > TREE_TOP - 0.8 or any((tip - u).length < 0.68 for u in used):
        continue
    used.append(tip)
    col, met = palette[k % len(palette)]
    k += 1
    c = tip + Vector((math.cos(a), math.sin(a), 0)) * 0.12
    ornament((c.x, c.y, c.z - 0.16 - r), r, col, met, hang_to=tip)

for o in [o for o in bpy.data.objects if o.parent is None and o.type in ("MESH", "CURVE", "LIGHT")]:
    o.location.y += TREE_Y

place(closed_gift(*crimson, loop_yaw=18), (-0.3, -1.1, 0), -18, (0.95, 0.95, 1.0))
place(closed_gift(*emerald, loop_yaw=-22), (-2.75, -0.55, 0), 22, (0.82, 0.82, 0.72))
place(closed_gift(*royal, loop_yaw=40), (2.2, -0.75, 0), -40, (0.72, 0.72, 0.85))
place(closed_gift(*golden, loop_yaw=-10), (-4.0, -0.75, 0), 14, (0.55, 0.55, 0.5))
place(closed_gift(*ivory, loop_yaw=30), (3.75, -1.1, 0), -30, (0.58, 0.58, 0.62))

shadow_catcher(size=30)
studio(target=(0, 0, 1.6), scale=1.4)
camera((0.2, -12.5, 3.2), (0, 0, 2.3), lens=38)
render(os.path.join(OUT, "hero.png"))
