"""Spinning dreidel: renders dreidel_00.png .. dreidel_23.png (one full turn, 15 degrees per frame).

Sapphire lacquer body, gold trim, raised gold letters (nun, gimel, hei, shin).
The whole toy pivots on its tip, tilted slightly, and the tilt axis precesses
with the spin so the loop reads as a real wobbling spin.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403
from mathutils import Quaternion, Vector  # noqa: E402

OUT = out_dir()
FRAMES = 24
TILT_DEG = 7.0

FONT_CANDIDATES = [
    "/System/Library/Fonts/SFHebrew.ttf",
    "/System/Library/Fonts/ArialHB.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]
LETTERS = ["נ", "ג", "ה", "ש"]  # nun, gimel, hei, shin

# Geometry (tip touches the ground at z=0)
TIP_H = 0.72          # pyramid height
BODY_W = 1.0
BODY_H = 1.08
BODY_Z0 = TIP_H
BODY_Z1 = TIP_H + BODY_H


def load_font():
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return bpy.data.fonts.load(path)
            except Exception as e:  # noqa: BLE001
                print(f"[art] font {path} failed: {e}")
    return None


def lacquer():
    m = principled("Sapphire", (0.004, 0.022, 0.17), roughness=0.3, coat=1.0, coat_rough=0.02, specular=0.6)
    # Very faint metallic flake under the clear coat for depth.
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 220
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1)
    ramp.color_ramp.elements[1].position = 0.12
    ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1)
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Metallic"])
    return m


def letter(ch, font, mat, face_index, parent):
    cd = bpy.data.curves.new(f"Letter{face_index}", "FONT")
    cd.body = ch
    if font:
        cd.font = font
    cd.size = 0.92
    cd.offset = 0.012
    cd.extrude = 0.024
    cd.bevel_depth = 0.008
    cd.bevel_resolution = 3
    cd.align_x = "CENTER"
    cd.align_y = "CENTER"
    o = bpy.data.objects.new(f"Letter{face_index}", cd)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    # Text lies in XY facing +Z. Rotate +90 about X so it faces -Y, then spin to its face.
    ang = deg(90 * face_index)
    out = Vector((math.sin(ang), -math.cos(ang), 0.0))
    dist = BODY_W / 2 + 0.018
    o.rotation_euler = (deg(90), 0.0, ang)
    o.location = out * dist + Vector((0, 0, (BODY_Z0 + BODY_Z1) / 2))
    o.parent = parent
    return o


def build():
    reset()
    setup_render(res=480, samples=96)
    s = bpy.context.scene
    s.view_settings.look = "AgX - Punchy"

    blue = lacquer()
    gilt = gold("Gold", roughness=0.2)
    gilt_brushed = gold("GoldBrushed", roughness=0.3)
    add_bump(gilt_brushed, scale=90, strength=0.04)

    pivot = bpy.data.objects.new("Dreidel", None)
    bpy.context.collection.objects.link(pivot)
    parts = []

    # Body
    body = cube("Body", (BODY_W, BODY_W, BODY_H), (0, 0, (BODY_Z0 + BODY_Z1) / 2), bevel=0.07)
    assign(body, blue)
    parts.append(body)

    # Pyramid point, aligned to the body's square, pointing down.
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=BODY_W / 2 * math.sqrt(2) * 0.985, radius2=0.0,
                                    depth=TIP_H, location=(0, 0, TIP_H / 2), rotation=(math.pi, 0, deg(45)))
    tip = bpy.context.object
    tip.name = "Tip"
    smooth(tip, bevel=0.035, segments=4)
    assign(tip, blue)
    parts.append(tip)
    # Rounded gold tip ball where it meets the ground.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(0, 0, 0.06), segments=32, ring_count=16)
    ball = bpy.context.object
    smooth(ball)
    assign(ball, gilt)
    parts.append(ball)

    # Gold bands at the top and bottom of the body, slightly proud of the faces.
    for z in (BODY_Z0 + 0.045, BODY_Z1 - 0.045):
        band = cube("Band", (BODY_W + 0.03, BODY_W + 0.03, 0.06), (0, 0, z), bevel=0.02)
        assign(band, gilt)
        parts.append(band)
    # Gold edge rods on the four vertical corners.
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod = cylinder("Edge", 0.034, BODY_H - 0.12, (sx * (BODY_W / 2 - 0.028), sy * (BODY_W / 2 - 0.028),
                                                          (BODY_Z0 + BODY_Z1) / 2), verts=24)
            assign(rod, gilt)
            parts.append(rod)

    # Top plate + handle with gold collar and cap.
    plate = cube("Plate", (BODY_W * 0.84, BODY_W * 0.84, 0.05), (0, 0, BODY_Z1 + 0.015), bevel=0.02)
    assign(plate, gilt_brushed)
    parts.append(plate)
    collar = cylinder("Collar", 0.15, 0.08, (0, 0, BODY_Z1 + 0.08), verts=48, bevel=0.02)
    assign(collar, gilt)
    parts.append(collar)
    handle = cylinder("Handle", 0.095, 0.46, (0, 0, BODY_Z1 + 0.33), verts=48, bevel=0.015)
    assign(handle, blue)
    parts.append(handle)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.135, location=(0, 0, BODY_Z1 + 0.6), segments=48, ring_count=24)
    cap = bpy.context.object
    cap.scale = (1, 1, 0.9)
    smooth(cap)
    assign(cap, gilt)
    parts.append(cap)

    font = load_font()
    for i, ch in enumerate(LETTERS):
        parts.append(letter(ch, font, gilt, i, None))

    for p in parts:
        if p.parent is None:
            p.parent = pivot

    catcher = shadow_catcher(size=30)

    target = (0, 0, 1.12)
    studio(target=target, scale=1.0)
    # Extra rims so the silhouette separates from a dark navy page.
    area_light("RimR", (4.5, 4.0, 3.0), target, 650, 2.0, (0.75, 0.85, 1.0))
    area_light("RimL", (-4.5, 3.5, 2.2), target, 450, 2.0, (1.0, 0.9, 0.75))

    # Only the overhead light may shadow the ground: every other light is linked to
    # the dreidel alone, so the shadow catcher stays a tight contact shadow instead
    # of long smears that would be cut off at the image edge.
    toy = bpy.data.collections.new("DreidelParts")
    bpy.context.scene.collection.children.link(toy)
    for p in parts:
        toy.objects.link(p)
    for name in ("Key", "Fill", "Rim", "RimR", "RimL"):
        bpy.data.objects[name].light_linking.receiver_collection = toy
    top = bpy.data.objects["Top"]
    top.location = (0.0, 0.0, 6.0)
    top.data.size = 6.0
    top.data.energy = 260

    # Shadowless fill that lights only the ground. The shadow catcher reports shadow
    # as a ratio of light lost, so unshadowed light here keeps the contact shadow soft
    # and lets its tail fade out well before the image edge.
    ground = bpy.data.collections.new("Ground")
    bpy.context.scene.collection.children.link(ground)
    ground.objects.link(catcher)
    gfill = area_light("GroundFill", (0.0, 0.0, 6.0), (0, 0, 0), 1400, 10.0)
    if hasattr(gfill.data, "use_shadow"):
        gfill.data.use_shadow = False
    elif hasattr(gfill.data, "cycles"):
        gfill.data.cycles.cast_shadow = False
    gfill.light_linking.receiver_collection = ground

    camera((0.0, -6.2, 2.75), (0, 0, 1.15), lens=68)
    return pivot


def pose(pivot, frame):
    spin = 2 * math.pi * frame / FRAMES
    # Tilt axis precesses with the spin (axis lags the spin by 90 degrees).
    axis = Vector((math.cos(spin), math.sin(spin), 0.0))
    q = Quaternion(axis, deg(TILT_DEG)) @ Quaternion((0, 0, 1), spin)
    pivot.rotation_mode = "QUATERNION"
    pivot.rotation_quaternion = q


pivot = build()
for f in range(FRAMES):
    pose(pivot, f)
    render(os.path.join(OUT, f"dreidel_{f:02d}.png"))
