"""People for the Nativity in countdown.py: Mary kneeling in prayer, Joseph standing with his staff.

Each starts from an anatomical body (Blender Studio's "Human Base Meshes" bundle, CC0 — public
domain; art/render.sh fetches it into a cache folder, it is not kept in this repo), is given a
simple skeleton and posed, and is then dressed: a tunic fitted to the body, a skirt and a mantle
that are real cloth, dropped onto the figure and left to fall under gravity so the folds are true.

Run on its own for a studio look at the two figures:
    Blender -b --factory-startup -P art/figures.py -- art/build
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
    select_only(*eyes, body)
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = f"Body_{kind}"
    for p in body.data.polygons:
        p.use_smooth = True
    return body


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
    # Mark where hair and beard grow while the head is still upright and easy to measure.
    head = [v for v in body.data.vertices if v.co.z > 0.86 * H and abs(v.co.x) < 0.12]
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


def grid_cloth(name, width, length, nx, ny, origin, pin):
    """A flat rectangle of cloth lying level. `pin(x, y)` says which points are held in place."""
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            verts.append((origin[0] - width / 2 + width * i / nx, origin[1] + length * j / ny, origin[2]))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
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


def skirt_cloth(name, top_z, top_r, hem_z, hem_r, center, segs=96, rows=46, pleats=11, depth=0.07):
    """A tube of cloth, a little flared and gathered into soft pleats, held at the waist."""
    verts, faces = [], []
    for r in range(rows + 1):
        f = r / rows
        z = top_z + (hem_z - top_z) * f
        base = top_r + (hem_r - top_r) * f ** 0.8
        for s in range(segs):
            a = 2 * math.pi * s / segs
            rad = base * (1 + depth * min(1.0, f * 4) * math.sin(pleats * a + 0.7 * math.sin(3 * a)))
            verts.append((center[0] + rad * math.cos(a), center[1] + rad * 0.86 * math.sin(a), z))
    for r in range(rows):
        for s in range(segs):
            a, b = r * segs + s, r * segs + (s + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.vertex_groups.new(name="Pin").add(list(range(segs * 2)), 1.0, "REPLACE")
    return o


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
        if o.name.split(".")[0] in ("Scalp", "Beard"):
            add_bump(o.data.materials[0], scale=260.0, strength=0.35, detail=2.0) if not o.data.materials[0].get("bumped") else None
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


def cloth_material(name, color):
    m = principled(name, color, roughness=0.7, sheen=0.35)
    add_bump(m, scale=140.0, strength=0.1, detail=2.0)
    return m


def rope_belt(z, rx, ry, y, mat):
    pts = [(rx * math.cos(a), y + ry * math.sin(a), z) for a in [2 * math.pi * k / 16 for k in range(16)]]
    o = curve_tube("Belt", pts, 0.012, resolution=6, closed=True)
    o.data.materials.append(mat)
    return o


def finish_body(body, rig, skin):
    freeze(body)
    bpy.data.objects.remove(rig, do_unlink=True)
    assign(body, skin)
    collide(body)


def root_of(objs, name):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    return root


def mary(mats):
    """Kneeling, hands together, head bowed; cream tunic, blue mantle over her head and shoulders."""
    before = set(bpy.data.objects)
    body = load_body("female")
    rig, j = skeleton(body)
    H, sz = j["H"], j["shoulder"].z
    # Kneel upright, shins folded back under her.
    for side in ("L", "R"):
        pitch(rig, f"shin.{side}", 96)
        pitch(rig, f"foot.{side}", 55)
    pitch(rig, "spine", 7)
    pitch(rig, "chest", 7)
    pitch(rig, "neck", 14)
    pitch(rig, "head", 16)
    bpy.context.view_layer.update()
    for side, sx in (("L", 1), ("R", -1)):
        s_head = rig.matrix_world @ rig.pose.bones[f"upper_arm.{side}"].head
        w = reach(rig, side, (sx * 0.018, s_head.y - 0.2, s_head.z - 0.13), (sx * 0.5, 0.25, -1.0))
        aim(rig, f"hand.{side}", Vector((sx * 0.006, w.y - 0.07, w.z + 0.2)))
    knee_z = min((rig.matrix_world @ rig.pose.bones[f"shin.{s}"].head).z for s in ("L", "R"))
    drop = knee_z - 0.055
    finish_body(body, rig, mats["skin"])
    hair(body, "Scalp", mats["hair"])
    for o in (body, bpy.data.objects["Scalp"]):
        o.location.z -= drop
    bpy.context.view_layer.update()
    select_only(bpy.data.objects["Scalp"], body)
    bpy.ops.object.transform_apply(location=True)

    floor = ground_plane()
    top = tunic(body, mats["cream"])
    collide(top)
    waist_z = 0.635 * H - drop
    skirt = skirt_cloth("Skirt", waist_z + 0.03, 0.2, -0.22, 0.31, (0, 0.05, 0))
    make_cloth(skirt, stiffness=7.0, bending=0.08)
    settle([skirt], 60)
    assign(skirt, mats["cream"])
    rope_belt(waist_z + 0.01, 0.2, 0.17, 0.05, mats["rope"])

    crown, front = brow(body)
    mantle = grid_cloth("Mantle", 1.34, 1.95, 62, 88, (crown.x, front + 0.02, crown.z + 0.03),
                        lambda x, y: math.hypot(x - crown.x, y - crown.y) < 0.05)
    make_cloth(mantle, stiffness=7.0, bending=0.2, mass=0.2)
    settle([mantle], 75)
    assign(mantle, mats["blue"])
    bpy.data.objects.remove(floor, do_unlink=True)
    made = [o for o in bpy.data.objects if o not in before]
    polish(made)
    return root_of(made, "Mary")


def joseph(mats):
    """Standing watch, staff in his right hand, left hand on his heart; brown tunic, ochre mantle."""
    before = set(bpy.data.objects)
    body = load_body("male")
    rig, j = skeleton(body)
    H = j["H"]
    pitch(rig, "chest", 4)
    pitch(rig, "neck", 10)
    pitch(rig, "head", 12)
    bpy.context.view_layer.update()
    # Right arm (his right is -x): forearm forward to hold the staff.
    s_head = rig.matrix_world @ rig.pose.bones["upper_arm.R"].head
    w = reach(rig, "R", (s_head.x - 0.06, s_head.y - 0.27, s_head.z - 0.3), (-0.4, 0.5, -1.0))
    aim(rig, "hand.R", w + Vector((0.05, -0.1, -0.02)))
    staff_at = w + Vector((0.02, -0.075, 0.0))
    # Left arm: hand resting on his heart.
    s_head = rig.matrix_world @ rig.pose.bones["upper_arm.L"].head
    w = reach(rig, "L", (0.07, s_head.y - 0.15, s_head.z - 0.2), (0.6, 0.3, -1.0))
    aim(rig, "hand.L", w + Vector((-0.16, -0.01, 0.05)))
    finish_body(body, rig, mats["skin"])
    hair(body, "Scalp", mats["hair"])
    hair(body, "Beard", mats["hair"], lift=0.014)

    floor = ground_plane()
    top = tunic(body, mats["brown"])
    collide(top)
    waist_z = 0.635 * H
    skirt = skirt_cloth("Skirt", waist_z + 0.03, 0.21, 0.02, 0.33, (0, 0.02, 0))
    make_cloth(skirt, stiffness=9.0, bending=0.3)
    settle([skirt], 50)
    assign(skirt, mats["brown"])
    rope_belt(waist_z + 0.01, 0.2, 0.165, 0.02, mats["rope"])

    crown, front = brow(body)
    mantle = grid_cloth("Mantle", 1.4, 1.6, 64, 74, (crown.x, front + 0.02, crown.z + 0.03),
                        lambda x, y: math.hypot(x - crown.x, y - crown.y) < 0.05)
    make_cloth(mantle, stiffness=7.0, bending=0.22, mass=0.2)
    settle([mantle], 75)
    assign(mantle, mats["ochre"])
    bpy.data.objects.remove(floor, do_unlink=True)

    staff = curve_tube("Staff", [(staff_at.x, staff_at.y, 0.0), (staff_at.x, staff_at.y, 1.0), (staff_at.x, staff_at.y, 1.84),
                                 (staff_at.x + 0.03, staff_at.y, 1.95), (staff_at.x + 0.1, staff_at.y, 1.93)], 0.02, resolution=12)
    staff.data.materials.append(mats["staff"])
    made = [o for o in bpy.data.objects if o not in before]
    polish(made)
    return root_of(made, "Joseph")


def people():
    """Mary and Joseph, built once and kept in art/build/nativity-figures.blend (draping the
    cloth takes a few minutes); rebuilt whenever this file changes. Call in an empty scene."""
    path = os.path.join(ART_DIR, "build", "nativity-figures.blend")
    if os.path.exists(path) and os.path.getmtime(path) >= os.path.getmtime(os.path.abspath(__file__)):
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            bpy.context.collection.objects.link(o)
        print("[art] figures: reused " + path)
        return bpy.data.objects["Mary"], bpy.data.objects["Joseph"]
    before = set(bpy.data.objects)
    mats = figure_materials()
    m, j = mary(mats), joseph(mats)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.data.libraries.write(path, {o for o in bpy.data.objects if o not in before}, fake_user=True)
    print("[art] figures: built and saved " + path)
    return m, j


def figure_materials():
    return {
        "skin": principled("Skin", (0.5, 0.29, 0.2), roughness=0.5),
        "hair": principled("Hair", (0.03, 0.017, 0.01), roughness=0.55),
        "cream": cloth_material("Cream", (0.78, 0.72, 0.6)),
        "blue": cloth_material("MaryBlue", (0.03, 0.09, 0.36)),
        "brown": cloth_material("JosephBrown", (0.2, 0.09, 0.04)),
        "ochre": cloth_material("JosephOchre", (0.42, 0.24, 0.07)),
        "rope": principled("Rope", (0.3, 0.22, 0.12), roughness=0.8),
        "staff": principled("Staff", (0.1, 0.055, 0.025), roughness=0.75),
    }


if __name__ == "__main__":
    reset()
    setup_render(res=900, samples=int(os.environ.get("ART_SAMPLES", 64)))
    bpy.context.scene.render.resolution_x = 1300
    m, jo = people()
    m.location = (-0.75, 0, 0)
    m.rotation_euler = (0, 0, deg(40))
    jo.location = (0.75, 0, 0)
    jo.rotation_euler = (0, 0, deg(-35))
    shadow_catcher(size=20)
    studio(target=(0, 0, 0.9), scale=1.1)
    camera((0, -5.2, 1.25), (0, 0, 0.88), lens=50)
    render(os.path.join(out_dir(), "figures-test.png"))
