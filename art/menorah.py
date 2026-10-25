"""Nine-branch Hanukkah menorah (hanukkiah), lit candle by candle.

Writes menorah_0.png (unlit) .. menorah_9.png:
  0 = nothing lit, 1 = shamash only, 2..9 = shamash + 1..8 candles.
Candles are added right-to-left from the viewer, as on successive nights.
Camera and geometry are identical across frames so they crossfade cleanly.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403

OUT = out_dir()

ROW_Z = 1.50          # top of the eight candle cups' arms
SHAMASH_Z = 1.95      # shamash arm top (taller, distinct)
XS = [-1.40, -1.05, -0.70, -0.35, 0.35, 0.70, 1.05, 1.40]
CANDLE_H = 0.40
CANDLE_R = 0.034


def brass():
    m = gold("Brass", roughness=0.16, tint=(1.0, 0.74, 0.32))
    bsdf(m).inputs["Anisotropic"].default_value = 0.35
    add_bump(m, scale=140, strength=0.015)
    return m


def wax(name, color):
    m = principled(name, color, roughness=0.42, coat=0.15, coat_rough=0.2)
    b = bsdf(m)
    b.inputs["Subsurface Weight"].default_value = 0.35
    b.inputs["Subsurface Radius"].default_value = (0.25, 0.15, 0.08)
    b.inputs["Subsurface Scale"].default_value = 0.04
    return m


def flame_material():
    """Emission-only teardrop: hot pale-yellow core at the base fading to orange at the tip."""
    m = bpy.data.materials.new("Flame")
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (1.0, 0.92, 0.55, 1)
    els[1].position = 1.0
    els[1].color = (1.0, 0.28, 0.02, 1)
    mid = els.new(0.40)
    mid.color = (1.0, 0.62, 0.12, 1)
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 6.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return m


def teardrop(name, loc, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=32, ring_count=24, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    for v in o.data.vertices:
        z = v.co.z
        if z > 0:
            taper = (1.0 - z) ** 1.6
            v.co.x *= taper
            v.co.y *= taper
            v.co.z = z * 2.4
    o.scale = (0.042, 0.042, 0.062)
    o.location = loc
    smooth(o)
    assign(o, mat)
    o.visible_shadow = False
    o.visible_diffuse = True
    return o


def semi_ellipse(x_r, z_top, z_depth, n=11):
    pts = []
    for i in range(n):
        a = math.pi * i / (n - 1)
        pts.append((-x_r * math.cos(a), 0.0, z_top - z_depth * math.sin(a)))
    return pts


def cup(name, x, z, mat, scale=1.0):
    parts = []
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055 * scale, location=(x, 0, z - 0.01), segments=32, ring_count=16)
    knob = bpy.context.object
    knob.name = name + "Knob"
    smooth(knob)
    parts.append(knob)
    bpy.ops.mesh.primitive_cone_add(radius1=0.045 * scale, radius2=0.085 * scale, depth=0.11 * scale,
                                    location=(x, 0, z + 0.06 * scale), vertices=48)
    c = bpy.context.object
    c.name = name
    smooth(c, bevel=0.006, segments=3)
    parts.append(c)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.085 * scale, minor_radius=0.011 * scale,
                                     location=(x, 0, z + 0.115 * scale), major_segments=48, minor_segments=12)
    rim = bpy.context.object
    smooth(rim)
    parts.append(rim)
    for p in parts:
        assign(p, mat)
    return z + 0.115 * scale  # cup top


def candle(name, x, z_base, mat, wick_mat, flame_mat, height=CANDLE_H):
    c = cylinder(name, CANDLE_R, height, (x, 0, z_base + height / 2), verts=40, bevel=0.008)
    assign(c, mat)
    top = z_base + height
    w = cylinder(name + "Wick", 0.005, 0.05, (x, 0, top + 0.02), verts=12)
    assign(w, wick_mat)
    f = teardrop(name + "Flame", (x, 0, top + 0.07), flame_mat)
    lamp = point_light(name + "Glow", (x, -0.03, top + 0.11), 3.0, (1.0, 0.66, 0.30), radius=0.03)
    lamp.data.use_shadow = False
    return f, lamp


def build():
    reset()
    setup_render(res=640, samples=112)
    world(0.02, 0.03, 0.065, 0.6)
    metal = brass()
    white = wax("WaxWhite", (0.93, 0.89, 0.80))
    blue = wax("WaxBlue", (0.55, 0.70, 0.95))
    wick = principled("Wick", (0.05, 0.04, 0.03), roughness=0.9)
    fmat = flame_material()

    # --- Base: wide foot, flared bell, collar ---
    foot = cylinder("Foot", 0.62, 0.07, (0, 0, 0.035), verts=96, bevel=0.02)
    bpy.ops.mesh.primitive_cone_add(radius1=0.52, radius2=0.10, depth=0.34, location=(0, 0, 0.24), vertices=96)
    bell = bpy.context.object
    smooth(bell, bevel=0.02, segments=4)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.56, minor_radius=0.03, location=(0, 0, 0.075),
                                     major_segments=96, minor_segments=16)
    ring = smooth(bpy.context.object)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(0, 0, 0.44), segments=48, ring_count=24)
    collar = smooth(bpy.context.object)
    for o in (foot, bell, ring, collar):
        assign(o, metal)

    # --- Central stem up to the shamash ---
    stem = cylinder("Stem", 0.05, SHAMASH_Z - 0.40, (0, 0, 0.40 + (SHAMASH_Z - 0.40) / 2), verts=48)
    assign(stem, metal)
    for zk in (0.95, 1.45):  # decorative knops on the stem
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.075, location=(0, 0, zk), segments=40, ring_count=20)
        k = smooth(bpy.context.object)
        k.scale = (1, 1, 0.8)
        assign(k, metal)

    # --- Four nested U-shaped arms (each carries two candle cups) ---
    for xr in (0.35, 0.70, 1.05, 1.40):
        depth = 0.30 + xr * 0.62
        arm = curve_tube(f"Arm{xr}", semi_ellipse(xr, ROW_Z, depth), bevel_depth=0.032, resolution=32)
        arm.data.materials.append(metal)

    flames = []  # (flame, light) ordered right-to-left for lighting order
    for i, x in enumerate(XS):
        top = cup(f"Cup{i}", x, ROW_Z, metal)
        f, l = candle(f"Candle{i}", x, top - 0.02, blue if i % 2 else white, wick, fmat)
        flames.append((x, f, l))
    flames.sort(key=lambda t: -t[0])  # rightmost (viewer's right) first

    sh_top = cup("ShamashCup", 0, SHAMASH_Z, metal, scale=1.15)
    sf, sl = candle("Shamash", 0, sh_top - 0.02, white, wick, fmat, height=CANDLE_H + 0.04)

    catcher = shadow_catcher(size=1.0)
    catcher.scale = (1.9, 1.3, 1)
    studio(target=(0, 0, 1.2), scale=1.0)
    area_light("RimRight", (3.5, 4.0, 3.0), (0, 0, 1.2), 500, 2.0, (0.85, 0.9, 1.0))
    camera((0, -8.4, 2.35), (0, 0, 1.30), lens=72)
    return sf, sl, flames


def set_lit(obj_light_pairs, lit):
    for f, l in obj_light_pairs:
        f.hide_render = not lit
        l.hide_render = not lit


sf, sl, flames = build()
for frame in range(10):
    set_lit([(sf, sl)], frame >= 1)
    for n, (_, f, l) in enumerate(flames):
        set_lit([(f, l)], frame >= 2 and n < frame - 1)
    render(os.path.join(OUT, f"menorah_{frame}.png"))
