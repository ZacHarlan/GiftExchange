"""People for the Nativity in countdown.py: Mary, Joseph and three shepherds.

Each starts from an anatomical body (Blender Studio's "Human Base Meshes" bundle, CC0 — public
domain; art/render.sh fetches it into a cache folder, it is not kept in this repo), is given a
simple skeleton and posed, and is then dressed: a tunic fitted to the body, a skirt and a mantle
that are real cloth, dropped onto the figure and left to fall under gravity so the folds are true.

Run on its own for a studio look at the two figures:
    Blender -b --factory-startup -P art/figures.py -- art/build

Dress follows what ordinary people of first-century Judea wore: an ankle-length wool tunic tied
with a cord, a rectangular wool mantle over the shoulders or head, bare feet or sandals, men
bearded, heads wrapped against the night cold. Cloth is undyed or earth-dyed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403

import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402

HBM = os.environ.get("HUMAN_BASE_MESHES", os.path.expanduser(
    "~/Library/Caches/giftexchange-art/hbm/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend"))


def select_only(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


def load_body(kind):
    """The realistic male or female base mesh, standing at the origin facing -y, eyes joined in."""
    names = [f"GEO-body_{kind}_realistic", f"GEO-body_{kind}_realistic.eye.L", f"GEO-body_{kind}_realistic.eye.R"]
    if not os.path.exists(HBM):
        raise SystemExit(f"[art] Human Base Meshes not found at {HBM} — run art/render.sh (it downloads them) or set HUMAN_BASE_MESHES")
    with bpy.data.libraries.load(HBM) as (src, dst):
        dst.objects = names
    body, *eyes = dst.objects
    for o in dst.objects:
        bpy.context.collection.objects.link(o)
        o.hide_render = False
        o.hide_viewport = False
        o.hide_set(False)
    body.modifiers.clear()
    body.location = (0, 0, 0)
    bpy.context.view_layer.update()
    # Slot 0 is skin (filled in later); the eyes bring their own painted material as slot 1.
    body.data.materials.clear()
    body.data.materials.append(None)
    body.data.color_attributes.new("EyeCol", "FLOAT_COLOR", "POINT")
    body.data.attributes.new("IsEye", "FLOAT", "POINT")
    for eye in eyes:
        flag = eye.data.attributes.new("IsEye", "FLOAT", "POINT")
        for item in flag.data:
            item.value = 1.0
        col = eye.data.color_attributes.new("EyeCol", "FLOAT_COLOR", "POINT")
        centre = eye.matrix_world.translation
        for v in eye.data.vertices:
            forward = -((eye.matrix_world @ v.co) - centre).normalized().y      # 1 = looking straight ahead
            col.data[v.index].color = ((0.0, 0.0, 0.0, 1) if forward > 0.93 else (0.045, 0.022, 0.01, 1)
                                       if forward > 0.7 else (0.3, 0.27, 0.25, 1))
        eye.data.materials.clear()
        eye.data.materials.append(eye_material())
    select_only(*eyes, body)
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = f"Body_{kind}"
    for p in body.data.polygons:
        p.use_smooth = True
    return body


def eye_material():
    m = bpy.data.materials.get("Eye")
    if m:
        return m
    m = principled("Eye", (0.6, 0.58, 0.55), roughness=0.06, coat=1.0, coat_rough=0.02)
    attr = m.node_tree.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "EyeCol"
    m.node_tree.links.new(attr.outputs["Color"], bsdf(m).inputs["Base Color"])
    return m


def skeleton(body):
    """A plain skeleton sized to the body, bound with automatic weights. Returns (rig, joints)."""
    co = [v.co for v in body.data.vertices]
    H = max(v.z for v in co)
    tip = max(co, key=lambda v: v.x)                       # fingertip of the figure's left hand (A-pose)
    sh = Vector((0.105 * H, 0.0, 0.815 * H))
    hand_dir = Vector((tip.x, 0.0, tip.z)) - sh
    j = {
        "hips": Vector((0, 0.01, 0.55 * H)), "waist": Vector((0, 0.01, 0.63 * H)), "chest": Vector((0, 0.01, 0.74 * H)),
        "neck": Vector((0, 0.01, 0.855 * H)), "head": Vector((0, 0.0, 0.905 * H)), "top": Vector((0, 0.0, H)),
        "hip": Vector((0.052 * H, 0.01, 0.535 * H)), "knee": Vector((0.055 * H, -0.005, 0.285 * H)),
        "ankle": Vector((0.055 * H, 0.03, 0.045 * H)), "toe": Vector((0.06 * H, -0.12, 0.01)),
        "shoulder": sh, "elbow": sh + hand_dir * 0.42, "wrist": sh + hand_dir * 0.78, "tip": sh + hand_dir,
        "H": H,
    }
    data = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", data)
    bpy.context.collection.objects.link(rig)
    select_only(rig)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        b = data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = data.edit_bones[parent]
        return b

    bone("hips", j["hips"], j["waist"])
    bone("spine", j["waist"], j["chest"], "hips")
    bone("chest", j["chest"], j["neck"], "spine")
    bone("neck", j["neck"], j["head"], "chest")
    bone("head", j["head"], j["top"], "neck")
    for side, sx in (("L", 1), ("R", -1)):
        m = lambda v: Vector((v.x * sx, v.y, v.z))
        bone(f"thigh.{side}", m(j["hip"]), m(j["knee"]), "hips")
        bone(f"shin.{side}", m(j["knee"]), m(j["ankle"]), f"thigh.{side}")
        bone(f"foot.{side}", m(j["ankle"]), m(j["toe"]), f"shin.{side}")
        bone(f"upper_arm.{side}", m(j["shoulder"]), m(j["elbow"]), "chest")
        bone(f"forearm.{side}", m(j["elbow"]), m(j["wrist"]), f"upper_arm.{side}")
        bone(f"hand.{side}", m(j["wrist"]), m(j["tip"]), f"forearm.{side}")
    bpy.ops.object.mode_set(mode="OBJECT")
    select_only(body, rig)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # The eyes are loose spheres inside the head: make them follow the head bone exactly.
    is_eye = body.data.attributes["IsEye"].data
    eye_verts = [v.index for v in body.data.vertices if is_eye[v.index].value > 0.5]
    for g in body.vertex_groups:
        g.remove(eye_verts)
    body.vertex_groups["head"].add(eye_verts, 1.0, "REPLACE")
    # Mark where hair and beard grow while the head is still upright and easy to measure.
    eye_set = set(eye_verts)
    head = [v for v in body.data.vertices if v.co.z > 0.86 * H and abs(v.co.x) < 0.12 and v.index not in eye_set]
    mid_y = (min(v.co.y for v in head) + max(v.co.y for v in head)) / 2
    # The hairline sits well above the brow at the front and comes down behind the ears.
    scalp = [v.index for v in head if v.co.z > 0.976 * H or (v.co.y > mid_y + 0.012 and v.co.z > 0.9 * H)
             or (v.co.y > mid_y - 0.03 and v.co.z > 0.955 * H)]
    beard = [v.index for v in head if 0.872 * H < v.co.z < 0.9 * H and v.co.y < mid_y + 0.02
             and not (v.co.z > 0.888 * H and abs(v.co.x) < 0.03 and v.co.y < mid_y - 0.055)]
    body.vertex_groups.new(name="Scalp").add(scalp, 1.0, "REPLACE")
    body.vertex_groups.new(name="Beard").add(beard, 1.0, "REPLACE")
    return rig, j


def reach(rig, side, target, pole):
    """Bends an arm at the elbow so the wrist arrives at `target`; `pole` says which way the elbow points."""
    bpy.context.view_layer.update()
    up, fore = rig.pose.bones[f"upper_arm.{side}"], rig.pose.bones[f"forearm.{side}"]
    S = rig.matrix_world @ up.head
    L1, L2 = up.length, fore.length
    P = Vector(target)
    d = min((P - S).length, (L1 + L2) * 0.995)
    axis = (P - S).normalized()
    P = S + axis * d
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    r = math.sqrt(max(0.0, L1 * L1 - a * a))
    out = Vector(pole) - Vector(pole).dot(axis) * axis
    elbow = S + axis * a + out.normalized() * r
    aim(rig, f"upper_arm.{side}", elbow)
    aim(rig, f"forearm.{side}", P)
    return P


def hair(body, group, mat, lift=0.012):
    """A cap of hair (or a beard) grown from a marked patch of the head."""
    select_only(body)
    bpy.ops.object.duplicate()
    h = bpy.context.object
    h.name = group
    keep = weights(h, [group])
    bm = bmesh.new()
    bm.from_mesh(h.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if keep[v.index] < 0.5], context="VERTS")
    bm.to_mesh(h.data)
    bm.free()
    h.modifiers.clear()
    out = h.modifiers.new("Lift", "DISPLACE")
    out.strength = lift
    out.mid_level = 0.0
    sm = h.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 3
    freeze(h)
    assign(h, mat)
    collide(h)
    return h


def aim(rig, name, target):
    """Swings a bone about its own joint until it points at `target` (world space)."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[name]
    M = rig.matrix_world @ pb.matrix
    head = M.translation.copy()
    current = (rig.matrix_world @ pb.tail) - head
    want = Vector(target) - head
    R = current.rotation_difference(want).to_matrix().to_4x4()
    T = Matrix.Translation(head)
    pb.matrix = rig.matrix_world.inverted() @ (T @ R @ T.inverted() @ M)
    bpy.context.view_layer.update()


def pitch(rig, name, degrees):
    """Tips a bone forward (towards -y, the way the figure faces) about its own joint."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[name]
    M = rig.matrix_world @ pb.matrix
    T = Matrix.Translation(M.translation)
    R = Matrix.Rotation(math.radians(degrees), 4, "X")
    pb.matrix = rig.matrix_world.inverted() @ (T @ R @ T.inverted() @ M)
    bpy.context.view_layer.update()


def freeze(obj):
    """Bakes every modifier (pose, cloth, …) into the mesh as it stands on the current frame."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def weights(obj, names):
    """Per-vertex summed weight of the named bone groups."""
    idx = {obj.vertex_groups[n].index for n in names if n in obj.vertex_groups}
    return [sum(g.weight for g in v.groups if g.group in idx) for v in obj.data.vertices]


def tunic(body, mat):
    """A close-fitting garment over torso and arms: the body's own surface, let out a little."""
    select_only(body)
    bpy.ops.object.duplicate()
    t = bpy.context.object
    t.name = "Tunic"
    skin = weights(t, ["head", "hand.L", "hand.R", "foot.L", "foot.R", "shin.L", "shin.R", "thigh.L", "thigh.R"])
    neck = weights(t, ["neck"])
    bm = bmesh.new()
    bm.from_mesh(t.data)
    bm.verts.ensure_lookup_table()
    drop = [v for v in bm.verts if skin[v.index] > 0.45 or neck[v.index] > 0.75]
    bmesh.ops.delete(bm, geom=drop, context="VERTS")
    bm.to_mesh(t.data)
    bm.free()
    out = t.modifiers.new("LetOut", "DISPLACE")
    out.strength = 0.016
    out.mid_level = 0.0
    sm = t.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.6
    sm.iterations = 6
    freeze(t)
    assign(t, mat)
    return t


def grid_cloth(name, width, length, nx, ny, origin, pin, hole=None):
    """A flat rectangle of cloth lying level. `pin(x, y)` says which points are held in place;
    `hole(x, y)` cuts an opening (the slot a mantle needs to sit round the neck)."""
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            verts.append((origin[0] - width / 2 + width * i / nx, origin[1] + length * j / ny, origin[2]))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            cx = (verts[a][0] + verts[a + nx + 2][0]) / 2
            cy = (verts[a][1] + verts[a + nx + 2][1]) / 2
            if hole and hole(cx, cy):
                continue
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    vg = o.vertex_groups.new(name="Pin")
    held = [k for k, v in enumerate(verts) if pin(v[0], v[1])]
    if held:
        vg.add(held, 1.0, "REPLACE")
    return o


def waist_outline(body, z, segs=96, ease=0.014):
    """The outline of the torso at height z: its centre, and how far the body reaches from it in
    each of `segs` directions (plus a little ease, so cloth lies on it rather than in it)."""
    torso = weights(body, ["hips", "spine", "chest"])
    band = [v.co for v in body.data.vertices if abs(v.co.z - z) < 0.03 and torso[v.index] > 0.5]
    cx = (min(v.x for v in band) + max(v.x for v in band)) / 2
    cy = (min(v.y for v in band) + max(v.y for v in band)) / 2
    reach = [0.0] * segs
    for v in band:
        a = math.atan2(v.y - cy, v.x - cx) % (2 * math.pi)
        k = int(a / (2 * math.pi) * segs) % segs
        reach[k] = max(reach[k], math.hypot(v.x - cx, v.y - cy))
    known = [r for r in reach if r > 0]
    typical = sum(known) / len(known)
    reach = [r if r > 0 else typical for r in reach]
    for _ in range(4):                                              # even out the jitter between neighbours
        reach = [(reach[k - 1] + 2 * reach[k] + reach[(k + 1) % segs]) / 4 for k in range(segs)]
    return (cx, cy), [r + ease for r in reach]


def smoothstep01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def skirt_cloth(name, body, top_z, hem_z, hem_r, segs=96, rows=50, pleats=11, depth=0.07):
    """The skirt of a tunic. Its top edge follows the wearer's own waist, held there as a belt
    would hold it, so body and robe are one continuous garment; below that it widens into
    soft pleats and is left to fall. Returns (cloth, the waist ring for the belt)."""
    (cx, cy), waist = waist_outline(body, top_z, segs)
    verts, faces = [], []
    for r in range(rows + 1):
        f = r / rows
        z = top_z + (hem_z - top_z) * f
        open_out = smoothstep01(f / 0.3)                           # snug at the belt, full by the hips
        for s in range(segs):
            a = 2 * math.pi * s / segs
            full = (waist[s] + (hem_r - waist[s]) * f ** 0.8) * (1 + depth * math.sin(pleats * a + 0.7 * math.sin(3 * a)))
            rad = waist[s] * (1 - open_out) + max(full, waist[s]) * open_out
            verts.append((cx + rad * math.cos(a), cy + rad * math.sin(a), z))
    for r in range(rows):
        for s in range(segs):
            a, b = r * segs + s, r * segs + (s + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.vertex_groups.new(name="Pin").add(list(range(segs * 3)), 1.0, "REPLACE")
    ring = [(cx + (waist[s] + 0.006) * math.cos(2 * math.pi * s / segs), cy + (waist[s] + 0.006) * math.sin(2 * math.pi * s / segs), top_z - 0.02)
            for s in range(0, segs, 6)]
    return o, ring


def make_cloth(o, stiffness=10.0, bending=0.35, mass=0.22):
    mod = o.modifiers.new("Cloth", "CLOTH")
    st = mod.settings
    st.quality = 7
    st.mass = mass
    st.tension_stiffness = stiffness
    st.compression_stiffness = stiffness
    st.shear_stiffness = stiffness * 0.4
    st.bending_stiffness = bending
    st.air_damping = 4.0
    st.vertex_group_mass = "Pin"
    cs = mod.collision_settings
    cs.use_collision = True
    cs.distance_min = 0.016
    cs.collision_quality = 5
    cs.use_self_collision = False
    return mod


def collide(o, thickness=0.014):
    if not any(m.type == "COLLISION" for m in o.modifiers):
        o.modifiers.new("Collision", "COLLISION")
    o.collision.thickness_outer = thickness
    o.collision.cloth_friction = 14.0
    return o


def settle(cloths, frames):
    """Lets the cloth fall and come to rest, then keeps it as ordinary geometry."""
    s = bpy.context.scene
    s.frame_start = 1
    for c in cloths:
        c.modifiers["Cloth"].point_cache.frame_start = 1
        c.modifiers["Cloth"].point_cache.frame_end = frames
    for f in range(1, frames + 1):
        s.frame_set(f)
    for c in cloths:
        freeze(c)
        c["cloth"] = True
        collide(c)
    s.frame_set(1)


def polish(objs):
    """Once nothing more will fall on them: give cloth its thickness and smooth everything."""
    for o in objs:
        if o.type != "MESH":
            continue
        if o.name.split(".")[0] in ("Scalp", "Beard") and not o.data.materials[0].get("bumped"):
            add_bump(o.data.materials[0], scale=190.0, strength=0.5, detail=3.0, distortion=1.5)
            o.data.materials[0]["bumped"] = True
        for m in [m for m in o.modifiers if m.type == "COLLISION"]:
            o.modifiers.remove(m)
        if o.get("cloth"):
            sol = o.modifiers.new("Thick", "SOLIDIFY")
            sol.thickness = 0.007
        sub = o.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = sub.render_levels = 1


def brow(body):
    """(crown, y of the front of the forehead) of a posed body: where a head covering should start."""
    top = max(v.co.z for v in body.data.vertices)
    head = [v.co for v in body.data.vertices if v.co.z > top - 0.2]
    crown = max(head, key=lambda v: v.z)
    upper = [v for v in head if v.z > top - 0.09]
    return crown, min(v.y for v in upper)


def ground_plane():
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    g = bpy.context.object
    g.name = "ClothFloor"
    collide(g, 0.004)
    g.hide_render = True
    return g


def cloth_material(name, color, stripe=None):
    """Hand-woven wool: uneven colour, a visible weave, optionally a few darker woven stripes."""
    m = principled(name, color, roughness=0.82, sheen=0.5)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    blotch = nt.nodes.new("ShaderNodeTexNoise")
    blotch.inputs["Scale"].default_value = 6.0
    blotch.inputs["Detail"].default_value = 6.0
    shade = nt.nodes.new("ShaderNodeMixRGB")
    shade.blend_type = "MULTIPLY"
    shade.inputs["Fac"].default_value = 0.55
    shade.inputs["Color1"].default_value = (*color, 1)
    nt.links.new(tc.outputs["Object"], blotch.inputs["Vector"])
    nt.links.new(blotch.outputs["Fac"], shade.inputs["Color2"])
    out = shade.outputs["Color"]
    if stripe:
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "Z"
        wave.inputs["Scale"].default_value = 2.2
        wave.inputs["Distortion"].default_value = 0.6
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.86
        ramp.color_ramp.elements[1].position = 0.9
        band = nt.nodes.new("ShaderNodeMixRGB")
        band.inputs["Color2"].default_value = (*stripe, 1)
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], band.inputs["Fac"])
        nt.links.new(out, band.inputs["Color1"])
        out = band.outputs["Color"]
    nt.links.new(out, bsdf(m).inputs["Base Color"])
    weave = nt.nodes.new("ShaderNodeTexWave")
    weave.inputs["Scale"].default_value = 190.0
    weave.inputs["Distortion"].default_value = 2.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    nt.links.new(tc.outputs["Object"], weave.inputs["Vector"])
    nt.links.new(weave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf(m).inputs["Normal"])
    return m


def skin_material(name, color):
    m = principled(name, color, roughness=0.48, specular=0.4)
    b = bsdf(m)
    b.inputs["Subsurface Weight"].default_value = 0.22
    b.inputs["Subsurface Radius"].default_value = (0.9, 0.35, 0.2)
    b.inputs["Subsurface Scale"].default_value = 0.012
    add_bump(m, scale=420.0, strength=0.05, detail=2.0)
    return m


def strands(obj, mat, count, length, curl=0.0, children=24, seed=1, thickness=0.0035):
    """Real hair (or a fleece) growing from every face of `obj`."""
    if mat.name not in [s.name for s in obj.material_slots]:
        obj.data.materials.append(mat)
    obj.modifiers.new("Strands", "PARTICLE_SYSTEM")
    ps = obj.particle_systems[-1]
    ps.seed = seed
    pt = ps.settings
    pt.type = "HAIR"
    pt.count = count
    pt.hair_length = length
    pt.emit_from = "FACE"
    pt.use_advanced_hair = True
    pt.normal_factor = 0.01
    pt.factor_random = 0.004
    pt.child_type = "INTERPOLATED"
    pt.rendered_child_count = children
    pt.child_length = 1.0
    pt.clump_factor = 0.3
    pt.roughness_2 = 0.003
    pt.roughness_endpoint = 0.002
    if curl:
        pt.kink = "CURL"
        pt.kink_amplitude = curl
        pt.kink_frequency = 3.0
    pt.root_radius = 1.0
    pt.tip_radius = 0.25
    pt.radius_scale = thickness
    pt.material_slot = mat.name


def head_wrap(body, mat, rng, loops=6):
    """A length of cloth wound round the head, as a man would against the night cold."""
    crown, _ = brow(body)
    made = []
    for k in range(loops):
        z = crown.z - 0.105 + 0.085 * k / (loops - 1)
        ring = [v.co for v in body.data.vertices if abs(v.co.z - z) < 0.012 and (v.co - crown).length < 0.2]
        if len(ring) < 8:
            continue
        cx = (min(v.x for v in ring) + max(v.x for v in ring)) / 2
        cy = (min(v.y for v in ring) + max(v.y for v in ring)) / 2
        rx = (max(v.x for v in ring) - min(v.x for v in ring)) / 2 + 0.014
        ry = (max(v.y for v in ring) - min(v.y for v in ring)) / 2 + 0.014
        tilt, phase = rng.uniform(-0.016, 0.016), rng.uniform(0, 6.28)
        pts = [(cx + rx * math.cos(a), cy + ry * math.sin(a), z + tilt * math.sin(a + phase) + 0.004 * math.sin(3 * a + phase))
               for a in [2 * math.pi * i / 18 for i in range(18)]]
        o = curve_tube("Wrap", pts, 0.021 + rng.uniform(-0.003, 0.004), resolution=6, closed=True)
        o.data.materials.append(mat)
        made.append(o)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.085, location=(crown.x, crown.y + 0.01, crown.z - 0.03), segments=24, ring_count=12)
    cap = bpy.context.object
    cap.name = "WrapCrown"
    cap.scale = (1.0, 1.12, 0.62)
    for p in cap.data.polygons:
        p.use_smooth = True
    assign(cap, mat)
    return made + [cap]


def rope_belt(ring, mat):
    """A cord tied round the waist, lying on the cloth all the way round."""
    o = curve_tube("Belt", ring, 0.012, resolution=6, closed=True)
    o.data.materials.append(mat)
    return o


def finish_body(body, rig, skin):
    freeze(body)
    bpy.data.objects.remove(rig, do_unlink=True)
    body.data.materials[0] = skin
    collide(body)


def root_of(objs, name):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    return root


def kneel(rig):
    for side in ("L", "R"):
        pitch(rig, f"shin.{side}", 96)
        pitch(rig, f"foot.{side}", 55)


def bow(rig, spine=0, chest=0, neck=0, head=0):
    for bone, angle in (("spine", spine), ("chest", chest), ("neck", neck), ("head", head)):
        if angle:
            pitch(rig, bone, angle)
    bpy.context.view_layer.update()


def shoulder(rig, side):
    return rig.matrix_world @ rig.pose.bones[f"upper_arm.{side}"].head


def pose_mary(rig):
    """Kneeling over the manger: one hand reaching to the child, the other at her heart."""
    kneel(rig)
    bow(rig, spine=9, chest=8, neck=10, head=12)
    s = shoulder(rig, "R")
    w = reach(rig, "R", (s.x + 0.04, s.y - 0.36, s.z - 0.2), (-0.5, 0.3, -1.0))
    aim(rig, "hand.R", w + Vector((0.03, -0.12, -0.07)))
    s = shoulder(rig, "L")
    w = reach(rig, "L", (0.05, s.y - 0.16, s.z - 0.17), (0.6, 0.3, -1.0))
    aim(rig, "hand.L", w + Vector((-0.15, -0.02, 0.06)))
    return {"kneel": True}


def pose_joseph(rig):
    """Standing over mother and child, staff in his right hand, left hand on his heart."""
    bow(rig, chest=6, neck=12, head=15)
    s = shoulder(rig, "R")
    w = reach(rig, "R", (s.x - 0.07, s.y - 0.27, s.z - 0.27), (-0.4, 0.5, -1.0))
    aim(rig, "hand.R", w + Vector((0.05, -0.1, -0.02)))
    staff = w + Vector((0.02, -0.075, 0.0))
    s = shoulder(rig, "L")
    w = reach(rig, "L", (0.07, s.y - 0.15, s.z - 0.2), (0.6, 0.3, -1.0))
    aim(rig, "hand.L", w + Vector((-0.16, -0.01, 0.05)))
    return {"staff": staff, "staff_top": 1.9}


def pose_praying(rig):
    """A shepherd on his knees, hands pressed together."""
    kneel(rig)
    bow(rig, spine=9, chest=7, neck=10, head=9)
    for side, sx in (("L", 1), ("R", -1)):
        s = shoulder(rig, side)
        w = reach(rig, side, (sx * 0.02, s.y - 0.2, s.z - 0.26), (sx * 0.55, 0.3, -1.0))
        aim(rig, f"hand.{side}", Vector((sx * 0.004, w.y - 0.09, w.z + 0.17)))
    return {"kneel": True}


def pose_youth(rig):
    """A boy kneeling, hands resting on his knees, looking at the child."""
    kneel(rig)
    bow(rig, spine=5, chest=4, neck=7, head=5)
    for side, sx in (("L", 1), ("R", -1)):
        s = shoulder(rig, side)
        w = reach(rig, side, (sx * 0.1, s.y - 0.15, s.z - 0.47), (sx * 0.6, 0.6, -0.6))
        aim(rig, f"hand.{side}", w + Vector((0.0, -0.1, -0.1)))
    return {"kneel": True}


def pose_elder(rig):
    """An old shepherd standing bent over his staff, both hands on it."""
    bow(rig, spine=8, chest=9, neck=10, head=9)
    s = shoulder(rig, "R")
    w = reach(rig, "R", (-0.035, s.y - 0.31, s.z - 0.16), (-0.6, 0.3, -1.0))
    aim(rig, "hand.R", w + Vector((0.08, -0.06, -0.03)))
    staff = Vector((0.0, w.y - 0.055, w.z))
    s = shoulder(rig, "L")
    w2 = reach(rig, "L", (0.035, s.y - 0.31, s.z - 0.26), (0.6, 0.3, -1.0))
    aim(rig, "hand.L", w2 + Vector((-0.08, -0.06, -0.03)))
    return {"staff": staff, "staff_top": 1.62}


def figure(name, kind, pose, look, mats, seed=1):
    """One dressed person. `look`: skin, tunic, mantle (None | ("head"|"shoulders", width, length,
    material)), hair / beard (material names or None), wrap
    (material of a head wrap or None), skirt_hem (radius)."""
    import random
    rng = random.Random(seed)
    before = set(bpy.data.objects)
    body = load_body(kind)
    rig, j = skeleton(body)
    H = j["H"]
    info = pose(rig)
    bpy.context.view_layer.update()
    drop = 0.0
    if info.get("kneel"):
        drop = min((rig.matrix_world @ rig.pose.bones[f"shin.{s}"].head).z for s in ("L", "R")) - 0.055
    finish_body(body, rig, mats[look["skin"]])
    caps = []
    if look.get("hair"):
        caps.append(hair(body, "Scalp", mats[look["hair"]]))
    if look.get("beard"):
        caps.append(hair(body, "Beard", mats[look["beard"]], lift=0.008))
    for o in [body] + caps:
        o.location.z -= drop
    bpy.context.view_layer.update()
    select_only(*caps, body)
    bpy.ops.object.transform_apply(location=True)

    floor = ground_plane()
    top = tunic(body, mats[look["tunic"]])
    collide(top)
    waist_z = 0.635 * H - drop
    kneeling = bool(info.get("kneel"))
    skirt, ring = skirt_cloth("Skirt", top, waist_z + 0.02, -0.22 if kneeling else 0.02, look.get("skirt_hem", 0.32))
    make_cloth(skirt, stiffness=7.5, bending=0.1 if kneeling else 0.28)
    settle([skirt], 55)
    assign(skirt, mats[look["tunic"]])
    rope_belt(ring, mats["rope"])

    mantle = None
    if look.get("mantle"):
        how, width, length, mat = look["mantle"]
        crown, front = brow(body)
        if how == "head":
            # Held over the crown and down to the hairline, so it cannot slip off a bowed head.
            mantle = grid_cloth("Mantle", width, length, int(width * 46), int(length * 46), (crown.x, front + 0.005, crown.z + 0.03),
                                lambda x, y: abs(x - crown.x) < 0.07 and front + 0.005 <= y < crown.y + 0.07)
        else:
            # Laid across the shoulders with a slot for the neck, held where a brooch or knot would be.
            neck = [v.co for v in body.data.vertices if abs(v.co.z - (0.875 * H - drop)) < 0.012 and abs(v.co.x) < 0.1]
            nx_, ny_ = sum(v.x for v in neck) / len(neck), sum(v.y for v in neck) / len(neck)
            z = max(v.co.z for v in body.data.vertices if abs(v.co.x) > 0.1 and v.co.z < 0.9 * H - drop and abs(v.co.y - ny_) < 0.12) + 0.03
            mantle = grid_cloth("Mantle", width, length, int(width * 46), int(length * 46), (nx_, ny_ - length * 0.42, z),
                                lambda x, y: abs(abs(x - nx_) - 0.15) < 0.03 and abs(y - ny_) < 0.03,
                                hole=lambda x, y: abs(x - nx_) < 0.085 and y < ny_ + 0.085)
        make_cloth(mantle, stiffness=7.0, bending=0.2, mass=0.22)
        settle([mantle], 72)
        assign(mantle, mats[mat])
    bpy.data.objects.remove(floor, do_unlink=True)

    # Hair and beards are close caps with a combed grain (see polish()): loose strands at this
    # size turned into bushes, and a strand "fleece" into spikes.
    if look.get("wrap"):
        head_wrap(body, mats[look["wrap"]], rng)
    if info.get("staff") is not None:
        p = info["staff"] - Vector((0, 0, drop))
        top_z = info.get("staff_top", 1.85)
        staff = curve_tube("Staff", [(p.x, p.y, 0.0), (p.x + 0.01, p.y, top_z * 0.5), (p.x, p.y + 0.005, top_z - 0.1),
                                     (p.x + 0.02, p.y, top_z - 0.01), (p.x + 0.075, p.y, top_z - 0.03)], 0.019, resolution=12)
        staff.data.materials.append(mats["staff"])
    made = [o for o in bpy.data.objects if o not in before]
    polish(made)
    return root_of(made, name)


def figure_materials():
    return {
        "skin": skin_material("Skin", (0.44, 0.25, 0.165)),
        "skin_fair": skin_material("SkinYoung", (0.5, 0.3, 0.21)),
        "skin_old": skin_material("SkinWeathered", (0.36, 0.2, 0.13)),
        "hair_dark": principled("HairDark", (0.018, 0.011, 0.007), roughness=0.4),
        "hair_brown": principled("HairBrown", (0.05, 0.027, 0.014), roughness=0.4),
        "hair_grey": principled("HairGrey", (0.3, 0.29, 0.27), roughness=0.5),
        "linen": cloth_material("Linen", (0.6, 0.53, 0.4)),
        "wool_cream": cloth_material("WoolCream", (0.62, 0.55, 0.42), stripe=(0.16, 0.1, 0.06)),
        "wool_blue": cloth_material("WoolBlue", (0.07, 0.12, 0.24)),
        "wool_brown": cloth_material("WoolBrown", (0.19, 0.1, 0.05)),
        "wool_ochre": cloth_material("WoolOchre", (0.38, 0.23, 0.09), stripe=(0.12, 0.06, 0.03)),
        "wool_grey": cloth_material("WoolGrey", (0.2, 0.18, 0.15)),
        "wool_rust": cloth_material("WoolRust", (0.3, 0.11, 0.05)),
        "wool_dark": cloth_material("WoolDark", (0.1, 0.075, 0.055), stripe=(0.3, 0.24, 0.16)),
        "fleece": principled("Fleece", (0.56, 0.5, 0.4), roughness=0.9),
        "rope": principled("Rope", (0.3, 0.22, 0.12), roughness=0.8),
        "staff": principled("Staff", (0.1, 0.055, 0.025), roughness=0.75),
    }


CAST = [
    # name, body, pose, look, seed
    ("Mary", "female", pose_mary, dict(skin="skin_fair", tunic="linen", mantle=("head", 1.34, 1.9, "wool_blue"),
                                       hair="hair_dark"), 11),
    ("Joseph", "male", pose_joseph, dict(skin="skin", tunic="wool_brown", mantle=("head", 1.36, 1.55, "wool_ochre"),
                                         hair="hair_dark", beard="hair_dark"), 12),
    # The shepherds wear the plain belted tunic of working men, heads wrapped against the cold.
    # (Cloaks draped over their bent arms came out torn, so they go without.)
    ("Shepherd", "male", pose_praying, dict(skin="skin", tunic="wool_grey", hair="hair_brown", beard="hair_brown"), 13),
    ("Youth", "male", pose_youth, dict(skin="skin_fair", tunic="wool_ochre", hair="hair_dark", wrap="wool_rust"), 14),
    ("Elder", "male", pose_elder, dict(skin="skin_old", tunic="wool_brown", hair="hair_grey", beard="hair_grey", wrap="linen"), 15),
]


def people(only=None):
    """The cast, built once and kept in art/build/nativity-figures.blend (draping the cloth takes
    some minutes); rebuilt whenever this file changes. Call in an empty scene.
    Returns {name: root object}."""
    path = os.path.join(ART_DIR, "build", "nativity-figures.blend")
    wanted = [c for c in CAST if not only or c[0] in only]
    if not only and os.path.exists(path) and os.path.getmtime(path) >= os.path.getmtime(os.path.abspath(__file__)):
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            bpy.context.collection.objects.link(o)
        print("[art] figures: reused " + path)
        return {c[0]: bpy.data.objects[c[0]] for c in CAST}
    before = set(bpy.data.objects)
    mats = figure_materials()
    roots = {}
    for name, kind, pose, look, seed in wanted:
        roots[name] = figure(name, kind, pose, look, mats, seed)
        print(f"[art] figures: built {name}")
    if not only:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        bpy.data.libraries.write(path, {o for o in bpy.data.objects if o not in before}, fake_user=True)
        print("[art] figures: saved " + path)
    return roots


if __name__ == "__main__":
    # ART_ONLY=Mary,Joseph builds just those (not cached) for a quick look.
    only = [n for n in os.environ.get("ART_ONLY", "").split(",") if n]
    reset()
    setup_render(res=900, samples=int(os.environ.get("ART_SAMPLES", 64)))
    bpy.context.scene.render.resolution_x = 1500
    cast = people(only or None)
    spots = {"Mary": (-0.85, 0.2, 55), "Joseph": (0.2, 0.9, -15), "Shepherd": (-1.9, -0.5, 100),
             "Youth": (1.2, -0.6, -120), "Elder": (1.9, 0.5, -60)}
    for i, (name, root) in enumerate(cast.items()):
        x, y, yaw = spots[name]
        if only:                                   # a close look: side by side, turned a little
            x, y, yaw = (i - (len(cast) - 1) / 2) * 0.95, 0.0, 22 - 44 * (i % 2)
        root.location = (x, y, 0)
        root.rotation_euler = (0, 0, deg(yaw))
    shadow_catcher(size=20)
    world(0.02, 0.03, 0.06, 0.6)
    point_light("Lamp", (-0.2, -0.7, 0.35), 260, (1.0, 0.6, 0.25), radius=0.06)
    area_light("Fill", (-3.0, -5.0, 3.0), (0, 0, 1.0), 220, 4.0, (0.7, 0.8, 1.0))
    area_light("Warm", (2.0, -3.0, 1.2), (0, 0.3, 1.0), 260, 2.0, (1.0, 0.72, 0.42))
    if only:
        camera((0, -3.6, 1.25), (0, 0, 0.95), lens=42)
    else:
        camera((0, -6.4, 1.3), (0, 0.2, 0.9), lens=40)
    render(os.path.join(out_dir(), "figures-test.png"))
