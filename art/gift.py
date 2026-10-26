"""Wrapped gift box: renders gift.png (closed) and gift-open.png (lid popping, light inside)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403

OUT = out_dir()


def wrapping_paper(base=(0.36, 0.008, 0.025), accent=(1.0, 0.7, 0.25), name="Paper", scale=9):
    """Lacquered paper (deep crimson by default) with a subtle metallic diamond pattern."""
    m = principled(name, base, roughness=0.38, coat=0.35, coat_rough=0.12, sheen=0.2)
    nt = m.node_tree
    b = bsdf(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    wave1 = nt.nodes.new("ShaderNodeTexWave")
    wave1.wave_type = "BANDS"
    wave1.bands_direction = "DIAGONAL"
    wave1.wave_profile = "TRI"
    wave2 = nt.nodes.new("ShaderNodeTexWave")
    wave2.wave_type = "BANDS"
    wave2.bands_direction = "DIAGONAL"
    wave2.wave_profile = "TRI"
    for w in (wave1, wave2):
        w.inputs["Scale"].default_value = 1.0
        w.inputs["Distortion"].default_value = 0.0
    rot = nt.nodes.new("ShaderNodeMapping")
    rot.inputs["Rotation"].default_value = (0, 0, deg(90))
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.80
    ramp.color_ramp.elements[1].position = 0.84
    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], wave1.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], rot.inputs["Vector"])
    nt.links.new(rot.outputs["Vector"], wave2.inputs["Vector"])
    nt.links.new(wave1.outputs["Fac"], mul.inputs[0])
    nt.links.new(wave2.outputs["Fac"], mul.inputs[1])
    nt.links.new(mul.outputs[0], ramp.inputs["Fac"])
    # Pattern lines become gold metal; the rest stays lacquered red paper.
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*base, 1)
    mix.inputs["B"].default_value = (*accent, 1)
    nt.links.new(ramp.outputs["Color"], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Metallic"])
    return m


def satin(name="Ribbon", color=(1.0, 0.68, 0.18)):
    m = principled(name, color, metallic=0.85, roughness=0.28, anisotropic=0.6, sheen=0.4)
    add_bump(m, scale=60, strength=0.03)
    return m


def bow(z, mat, loop_yaw=0.0, lid_half=0.79, tail_dir=-90.0):
    """Classic satin bow sitting on a lid whose top is at height `z`.

    Two flat ribbon loops pinched into a wrapped centre knot, plus two V-notched tails that run
    across the lid and drape over its edge. `loop_yaw` turns the loops (degrees) so they face the
    camera; `tail_dir` is the direction (degrees, 0 = +X) the tails run toward an edge `lid_half` away.
    """
    import math as _m
    from mathutils import Matrix
    W = 0.2  # same width as the bands round the box
    parts = []
    yaw = Matrix.Rotation(deg(loop_yaw), 3, "Z")
    gather = lambda t: 0.32 + 0.68 * _m.sin(_m.pi * t) ** 0.7  # pinched where it meets the knot

    def place(pts, R):
        return [tuple(yaw @ (R @ Vector(p)) + Vector((0, 0, z))) for p in pts]

    for side in (1, -1):
        # Loop drawn in the XZ plane: out and up from the knot, round the end, back underneath.
        loop_pts = [(0.02, 0, 0.08), (0.16, 0, 0.30), (0.40, 0, 0.46), (0.64, 0, 0.42), (0.74, 0, 0.24),
                    (0.62, 0, 0.08), (0.34, 0, 0.03), (0.04, 0, 0.06)]
        loop_pts = [(side * x, y, zz) for x, y, zz in loop_pts]
        # Lean the loops back a little and splay them into a shallow V seen from above.
        R = Matrix.Rotation(deg(side * 14), 3, "Z") @ Matrix.Rotation(deg(26), 3, "X")
        hint_w = yaw @ R @ Vector((0, 1, 0))
        parts.append(ribbon_strip("BowLoop", place(loop_pts, R), W * 1.55, lambda t, p, T, h=hint_w: h,
                                  scale_fn=gather, cup_fn=lambda t: 0.10 + 0.25 * (1 - _m.sin(_m.pi * t)),
                                  thickness=0.014, rows=140))

    # Tails: tucked under the knot, across the lid, over the edge, V-notched ends.
    td = Matrix.Rotation(deg(tail_dir + 90), 3, "Z")  # local -Y -> tail_dir
    e = lid_half + 0.02
    for side in (1, -1):
        tail_pts = [(side * 0.03, 0.05, 0.03), (side * 0.10, -0.12, 0.022), (side * 0.22, -0.40, 0.016),
                    (side * 0.30, -(e - 0.14), 0.013),
                    (side * 0.33, -e + 0.03, 0.006), (side * 0.345, -e - 0.005, -0.06),
                    (side * 0.35, -e - 0.01, -0.22)]
        pts = [tuple(td @ Vector(p) + Vector((0, 0, z))) for p in tail_pts]
        up = Vector((0, 0, 1))
        parts.append(ribbon_strip("BowTail", pts, W * 0.95,
                                  lambda t, p, T: up.cross(T) if abs(T.z) < 0.97 else Vector((1, 0, 0)),
                                  scale_fn=lambda t: 0.75 + 0.25 * min(1, t * 4),
                                  cup_fn=lambda t: 0.03, notch=0.07, thickness=0.012, rows=110))

    # Knot: a short piece of ribbon wrapped round the gathered loops.
    ring = [(0, 0.10 * _m.cos(a), 0.095 + 0.085 * _m.sin(a))
            for a in [deg(-90 + 360 * i / 12) for i in range(12)]]
    knot = ribbon_strip("BowKnot", place(ring, Matrix.Identity(3)), W * 0.9,
                        lambda t, p, T: yaw @ Vector((1, 0, 0)),
                        cup_fn=lambda t: -0.12, thickness=0.014, rows=80, closed=True)
    parts.append(knot)
    for p in parts:
        p.data.materials.append(mat)
    return parts


def build(open_lid=False):
    reset()
    setup_render(res=720, samples=160)
    paper = wrapping_paper()
    ribbon = satin()

    W, H = 1.5, 1.05
    box = cube("Box", (W, W, H), (0, 0, H / 2), bevel=0.025)
    assign(box, paper)

    lid_h = 0.28
    lid_z = H + lid_h / 2 - 0.12
    lid_objs = []
    lid = cube("Lid", (W + 0.08, W + 0.08, lid_h), (0, 0, lid_z), bevel=0.03)
    assign(lid, paper)
    lid_objs.append(lid)

    # Ribbon bands around box and lid.
    for sx, sy in ((0.2, W + 0.012), (W + 0.012, 0.2)):
        if open_lid:
            # Open box: ribbon only on the outside walls, nothing across the opening.
            t = 0.012
            for sign in (1, -1):
                if sx < 1:
                    strip = cube("Band", (sx, t, H - 0.02), (0, sign * (W / 2 + t / 2), H / 2), bevel=0.003)
                else:
                    strip = cube("Band", (t, sy, H - 0.02), (sign * (W / 2 + t / 2), 0, H / 2), bevel=0.003)
                assign(strip, ribbon)
        else:
            band = cube("Band", (sx, sy, H - 0.02), (0, 0, H / 2), bevel=0.005)
            assign(band, ribbon)
        lband = cube("LidBand", (sx + 0.0 if sx < 1 else W + 0.092, sy if sy < 1 else W + 0.092, lid_h + 0.012),
                     (0, 0, lid_z), bevel=0.005)
        if sx < 1:
            lband.scale = (1, 1, 1)
        assign(lband, ribbon)
        lid_objs.append(lband)

    lid_objs += bow(lid_z + lid_h / 2, ribbon, loop_yaw=38)

    if open_lid:
        # Hollow the box: drop the top face, give the walls thickness, line the inside with gold foil.
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(box.data)
        top = [f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > H - 0.01]
        bmesh.ops.delete(bm, geom=top, context="FACES")
        bm.to_mesh(box.data)
        bm.free()
        sol = box.modifiers.new("Walls", "SOLIDIFY")
        sol.thickness = 0.04
        sol.material_offset = 1
        box.data.materials.append(gold("Lining", roughness=0.35))
        # Glow from inside the box.
        inner = cube("Inner", (W - 0.1, W - 0.1, 0.02), (0, 0, H * 0.55))
        assign(inner, principled("Glow", (1, 0.85, 0.5), emission=(1.0, 0.78, 0.4), emission_strength=40))
        inner.visible_diffuse = False
        inner.visible_shadow = False
        # Light shaft rising out of the box (camera-visible only, so the floor stays clean).
        bpy.ops.mesh.primitive_cone_add(radius1=W * 0.42, radius2=W * 0.75, depth=1.6, location=(0, 0, H + 0.8), vertices=64)
        shaft = bpy.context.object
        sm = bpy.data.materials.new("Shaft")
        nt = sm.node_tree
        nt.nodes.remove(nt.nodes["Principled BSDF"])
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (1.0, 0.8, 0.45, 1)
        em.inputs["Strength"].default_value = 1.6
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.35
        grad = nt.nodes.new("ShaderNodeSeparateXYZ")
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Generated"], grad.inputs[0])
        fac = nt.nodes.new("ShaderNodeMath"); fac.operation = "MULTIPLY"
        inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
        nt.links.new(grad.outputs["Z"], inv.inputs[1])
        facing = nt.nodes.new("ShaderNodeMath"); facing.operation = "SUBTRACT"; facing.inputs[0].default_value = 1.0
        nt.links.new(lw.outputs["Facing"], facing.inputs[1])
        nt.links.new(inv.outputs[0], fac.inputs[0])
        nt.links.new(facing.outputs[0], fac.inputs[1])
        pw = nt.nodes.new("ShaderNodeMath"); pw.operation = "MULTIPLY"; pw.inputs[1].default_value = 0.55
        nt.links.new(fac.outputs[0], pw.inputs[0])
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(pw.outputs[0], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
        assign(shaft, sm)
        shaft.hide_render = True  # the light burst is added in post (art/post.py) — reads better than a cone
        for attr in ("visible_diffuse", "visible_glossy", "visible_shadow", "visible_transmission"):
            setattr(shaft, attr, False)
        area_light("Uplight", (0, 0, H - 0.05), (0, 0, H + 3), 120, W * 0.8, (1.0, 0.8, 0.45))
        pivot = bpy.data.objects.new("LidPivot", None)
        bpy.context.collection.objects.link(pivot)
        pivot.location = (0, -W / 2, lid_z)
        for o in lid_objs:
            o.parent = pivot
            o.location -= pivot.location
        pivot.location = (0.1, -W / 2 - 0.15, lid_z + 0.75)
        pivot.rotation_euler = (deg(-32), deg(8), deg(-6))

    shadow_catcher()
    studio(target=(0, 0, 0.7))
    camera((3.6, -4.6, 3.3), (0, 0, 0.82 if not open_lid else 1.05), lens=62)


if __name__ == "__main__":
    build(open_lid=False)
    render(os.path.join(OUT, "gift.png"))
    build(open_lid=True)
    render(os.path.join(OUT, "gift-open.png"))
