"""Countdown-to-Christmas scenery, rendered for countdown.js:

  countdown-land.png   a starlit winter valley (transparent sky): a chapel and cabins among snowy
                       firs, and in the foreground a stable with the Nativity, glowing from within.

The sky, the Star of Bethlehem and the falling snow are drawn live by countdown.js on top of
and behind this picture; the script prints where the stable sits so the star can hang over it.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403
import bmesh  # noqa: E402
import figures  # noqa: E402  (Mary and Joseph)
import hero  # noqa: E402  (for its fir-needle material; it only renders as __main__)
from mathutils import Matrix, noise  # noqa: E402

OUT = out_dir()


# ---------------------------------------------------------------------------
# Shared bits
# ---------------------------------------------------------------------------

def new_objects(before):
    return [o for o in bpy.data.objects if o not in before]


def into_collection(objs, name):
    """Moves objects into a collection that is only ever rendered through instances."""
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    bpy.context.view_layer.layer_collection.children[name].exclude = True
    return coll


def instance(coll, loc, rot_z=0.0, scale=1.0):
    e = bpy.data.objects.new("Inst", None)
    e.instance_type = "COLLECTION"
    e.instance_collection = coll
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    e.scale = (scale, scale, scale)
    return e


def sun(name, direction, strength, color, angle=2.0):
    data = bpy.data.lights.new(name, "SUN")
    data.energy = strength
    data.color = color
    data.angle = deg(angle)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
    return obj


def snow_material(name="Snow"):
    m = principled(name, (0.84, 0.89, 0.97), roughness=0.6, specular=0.35)
    add_bump(m, scale=9.0, strength=0.05, detail=9.0)
    return m


def turn(obj, center, rotation):
    """Rotates an object about `center`. (common.cube() bakes its position into the mesh, so its
    origin is the world origin and a plain rotation_euler would swing it round that instead.)"""
    from mathutils import Euler
    c = Matrix.Translation(Vector(center))
    obj.matrix_world = c @ Euler(rotation).to_matrix().to_4x4() @ c.inverted() @ obj.matrix_world
    return obj


def mesh_object(name, verts, faces, smooth_shade=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if smooth_shade:
        for p in me.polygons:
            p.use_smooth = True
    return o


# ---------------------------------------------------------------------------
# Landscape
# ---------------------------------------------------------------------------

CAM = Vector((0.0, -31.0, 2.9))
STABLE = Vector((5.9, -13.0, 0.0))       # right of centre, so the clock can sit to its left
STABLE_YAW = -14.0                      # turned to face the camera


def ground_height(x, y):
    """Snowfield: flat under the tree, soft drifts around it, rising into hills further back."""
    drift = 0.42 * noise.noise(Vector((x * 0.07, y * 0.07, 0.3))) + 0.1 * noise.noise(Vector((x * 0.27, y * 0.27, 5.0)))
    r = math.hypot(x - STABLE.x, y - STABLE.y)
    h = drift * min(1.0, max(0.0, (r - 4.6) / 7.0))
    back = max(0.0, y - 26.0)
    hills = noise.noise(Vector((x * 0.011, y * 0.011, 2.0))) * 0.5 + 0.5
    h += hills * back * 0.05 + 0.9 * noise.noise(Vector((x * 0.03, y * 0.03, 9.0))) * min(1.0, back / 40.0)
    # A shallow rise each side frames the middle of the valley.
    h += 0.00045 * abs(x) ** 2.1 * min(1.0, max(0.0, (y + 10.0) / 60.0))
    return h


def terrain():
    nx, ny = 300, 260
    verts, faces = [], []
    for j in range(ny + 1):
        y = CAM.y - 4.0 + 430.0 * (j / ny) ** 2.1
        half = 46.0 + (y - CAM.y) * 0.95
        for i in range(nx + 1):
            x = -half + 2 * half * i / nx
            verts.append((x, y, ground_height(x, y)))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_object("Terrain", verts, faces)
    assign(o, snow_material())
    return o


def mountains():
    """A far range, snow on the slopes and dark rock where it is steep."""
    nx, ny = 640, 150
    verts, faces = [], []
    for j in range(ny + 1):
        y = 430.0 + 520.0 * j / ny
        for i in range(nx + 1):
            x = -1150.0 + 2300.0 * i / nx
            ridge = noise.ridged_multi_fractal(Vector((x * 0.0034, y * 0.0034, 3.7)), 0.9, 2.2, 8, 1.0, 2.0) * 0.62
            env = math.sin(math.pi * j / ny) ** 0.7
            side = 0.6 + 0.4 * min(1.0, abs(x - 150.0) / 420.0)     # lower behind the stable, so the star has open sky
            verts.append((x, y, 30.0 + ridge * 105.0 * env * side))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_object("Mountains", verts, faces)
    m = principled("MountainSnow", (0.8, 0.86, 0.96), roughness=0.7)
    nt = m.node_tree
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.52
    ramp.color_ramp.elements[0].color = (0.035, 0.045, 0.075, 1)
    ramp.color_ramp.elements[1].position = 0.74
    ramp.color_ramp.elements[1].color = (0.8, 0.86, 0.96, 1)
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Base Color"])
    assign(o, m)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


def fir(rng, mats, H=9.0, R=2.5, tiers=12):
    """A fir in deep winter: real needles on drooping boughs, each bough carrying a pad of snow."""
    before = set(bpy.data.objects)
    boughs, pads = [], []
    for k in range(tiers):
        f = k / tiers
        h = 1.3 + (H - 2.0) * f + rng.uniform(-0.1, 0.1)
        Rk = R * (1 - f) ** 0.92 + 0.18
        n = max(5, int(15 * Rk / R) + 2)
        off = rng.random() * 6.28
        for j in range(n):
            a = off + 2 * math.pi * j / n + rng.uniform(-0.22, 0.22)
            L = Rk * rng.uniform(0.72, 1.08)
            c, s_ = math.cos(a), math.sin(a)
            droop = rng.uniform(0.26, 0.48) * L
            dz = rng.uniform(-0.12, 0.12)
            pts = [(0.03 * c, 0.03 * s_, h + 0.26 + dz), (0.4 * L * c, 0.4 * L * s_, h + 0.1 + dz),
                   (0.78 * L * c, 0.78 * L * s_, h - droop * 0.7 + dz), (L * c, L * s_, h - droop + dz)]
            side = Vector((-s_, c, 0))
            width = 0.46 * L + 0.16
            taper = lambda t: ((0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.15)) ** 0.8)
                               if t < 0.87 else max(0.08, (1 - t) * 4.5))
            boughs.append(ribbon_strip("Bough", pts, width, lambda t, p, T, w=side: w, scale_fn=taper,
                                       cup_fn=lambda t: 0.14, thickness=0.05, rows=12, cols=5))
            # Snow lies along the top of the bough, thickest in the middle, thinning to nothing at the tip.
            lifted = [(x, y, z + 0.075) for x, y, z in pts]
            cover = rng.uniform(0.5, 0.82)
            pads.append(ribbon_strip("Pad", lifted, width * cover, lambda t, p, T, w=side: w,
                                     scale_fn=lambda t, tp=taper: tp(t) * max(0.0, 1 - t ** 3) + 0.02,
                                     cup_fn=lambda t: 0.3, thickness=0.11, rows=10, cols=5))
    for wdir in (Vector((1, 0, 0)), Vector((0, 1, 0))):
        boughs.append(ribbon_strip("Leader", [(0, 0, H - 1.3), (0, 0, H - 0.5), (0, 0, H)], 0.34,
                                   lambda t, p, T, w=wdir: w, scale_fn=lambda t: max(0.08, 1 - t ** 1.5),
                                   thickness=0.04, rows=8, cols=3))
    tree = join(boughs, "Fir")
    assign(tree, mats["needles"])
    tree.modifiers.new("Needles", "PARTICLE_SYSTEM")
    ps = tree.particle_systems[0]
    ps.seed = rng.randrange(1000)
    pt = ps.settings
    pt.type = "HAIR"
    pt.count = int(5200 * R * H / 6)
    pt.hair_length = 0.2
    pt.emit_from = "FACE"
    pt.use_advanced_hair = False
    pt.child_type = "SIMPLE"
    pt.rendered_child_count = 5
    pt.child_length = 0.85
    pt.child_length_threshold = 0.4
    pt.child_radius = 0.07
    pt.root_radius = 1.0
    pt.tip_radius = 0.0
    pt.radius_scale = 0.016
    pt.material_slot = mats["needles"].name
    snow = join(pads, "FirSnow")
    sub = snow.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = 1
    for poly in snow.data.polygons:
        poly.use_smooth = True
    assign(snow, mats["snow"])
    trunk = cylinder("Trunk", 0.18, 2.4, (0, 0, 1.0), verts=12)
    assign(trunk, mats["bark"])
    return new_objects(before)


def log_material():
    m = principled("Logs", (0.085, 0.04, 0.018), roughness=0.82)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 2.7
    wave.inputs["Distortion"].default_value = 0.4
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.9
    bump.inputs["Distance"].default_value = 0.12
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf(m).inputs["Normal"])
    return m


def window(mats, x, y, z, w, h, facing):
    """A lit, four-pane window on a wall whose outward normal is `facing` ('-y' or '+x' / '-x')."""
    t = 0.06
    if facing == "-y":
        glass = cube("Glass", (w, t, h), (x, y - 0.02, z))
        bars = [cube("Bar", (0.07, 0.1, h + 0.12), (x, y - 0.04, z)), cube("Bar", (w + 0.12, 0.1, 0.07), (x, y - 0.04, z))]
        frame = [cube("Frame", (w + 0.24, 0.1, 0.12), (x, y - 0.03, z + sgn * (h / 2 + 0.06))) for sgn in (-1, 1)]
        frame += [cube("Frame", (0.12, 0.1, h + 0.24), (x + sgn * (w / 2 + 0.06), y - 0.03, z)) for sgn in (-1, 1)]
        sill = cube("SillSnow", (w + 0.4, 0.28, 0.12), (x, y - 0.14, z - h / 2 - 0.1), bevel=0.05)
    else:
        sgn_x = 1 if facing == "+x" else -1
        glass = cube("Glass", (t, w, h), (x + sgn_x * 0.02, y, z))
        bars = [cube("Bar", (0.1, 0.07, h + 0.12), (x + sgn_x * 0.04, y, z)), cube("Bar", (0.1, w + 0.12, 0.07), (x + sgn_x * 0.04, y, z))]
        frame = [cube("Frame", (0.1, w + 0.24, 0.12), (x + sgn_x * 0.03, y, z + sgn * (h / 2 + 0.06))) for sgn in (-1, 1)]
        frame += [cube("Frame", (0.1, 0.12, h + 0.24), (x + sgn_x * 0.03, y + sgn * (w / 2 + 0.06), z)) for sgn in (-1, 1)]
        sill = cube("SillSnow", (0.28, w + 0.4, 0.12), (x + sgn_x * 0.14, y, z - h / 2 - 0.1), bevel=0.05)
    assign(glass, mats["glow"])
    for o in bars + frame:
        assign(o, mats["trim"])
    assign(sill, mats["snow"])


def gable_roof(mats, W, D, wall_h, rise, overhang=0.7):
    """Two pitched slabs with a thick, soft blanket of snow on top."""
    half = W / 2 + overhang
    slope = math.atan2(rise, W / 2)
    length = half / math.cos(slope)
    for sgn in (-1, 1):
        cx = sgn * half / 2
        cz = wall_h + rise - (half / 2) * math.tan(slope)
        slab = cube("Roof", (length, D + 2 * overhang, 0.18), (cx, 0, cz))
        turn(slab, (cx, 0, cz), (0, sgn * slope, 0))
        assign(slab, mats["trim"])
        bz = cz + 0.3 / math.cos(slope)
        blanket = cube("RoofSnow", (length + 0.15, D + 2 * overhang + 0.2, 0.42), (cx - sgn * 0.02, 0, bz), bevel=0.16)
        turn(blanket, (cx - sgn * 0.02, 0, bz), (0, sgn * slope, 0))
        smooth(blanket, subsurf=2)
        assign(blanket, mats["snow"])
    # Gable ends (triangles) so the loft is closed.
    for sgn in (-1, 1):
        y = sgn * D / 2
        tri = mesh_object("Gable", [(-W / 2, y, wall_h), (W / 2, y, wall_h), (0, y, wall_h + rise)], [(0, 1, 2)], smooth_shade=False)
        sol = tri.modifiers.new("Thick", "SOLIDIFY")
        sol.thickness = 0.3
        sol.offset = 0
        assign(tri, mats["logs"])


def cabin(mats, rng, W=7.0, D=5.5, wall_h=2.9, rise=2.3):
    before = set(bpy.data.objects)
    walls = cube("Walls", (W, D, wall_h), (0, 0, wall_h / 2), bevel=0.04)
    assign(walls, mats["logs"])
    gable_roof(mats, W, D, wall_h, rise)
    # Front (towards the camera, -y): door and two windows; one window on each side wall.
    door = cube("Door", (1.05, 0.1, 2.05), (0.2, -D / 2 - 0.03, 1.03), bevel=0.02)
    assign(door, mats["trim"])
    for x in (-W * 0.3, W * 0.33):
        window(mats, x, -D / 2, 1.65, 1.15, 1.2, "-y")
    window(mats, W / 2, 0.3, 1.65, 1.2, 1.2, "+x")
    window(mats, -W / 2, 0.3, 1.65, 1.2, 1.2, "-x")
    window(mats, 0, -D / 2 - 0.16, wall_h + rise * 0.42, 0.7, 0.7, "-y")       # loft
    # Chimney with a snow cap.
    cx = W * 0.26
    stack = cube("Chimney", (0.85, 0.85, 2.6), (cx, 0.6, wall_h + rise - 0.2), bevel=0.03)
    assign(stack, mats["stone"])
    cap = cube("ChimneySnow", (1.0, 1.0, 0.22), (cx, 0.6, wall_h + rise + 1.18), bevel=0.09)
    smooth(cap, subsurf=1)
    assign(cap, mats["snow"])
    # Warm light spilling from the windows and the door lantern.
    for x in (-W * 0.3, W * 0.33):
        point_light("WindowGlow", (x, -D / 2 - 0.9, 1.5), 260, (1.0, 0.62, 0.28), radius=0.5)
    point_light("Lantern", (0.95, -D / 2 - 0.35, 2.35), 90, (1.0, 0.7, 0.35), radius=0.08)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=(0.95, -D / 2 - 0.3, 2.35), segments=12, ring_count=8)
    assign(bpy.context.object, mats["lantern"])
    bpy.context.object.visible_shadow = False
    return new_objects(before)


def chapel(mats):
    """A small white chapel: nave, bell tower with a lit belfry, slim snow-covered spire and cross."""
    before = set(bpy.data.objects)
    W, D, wall_h, rise = 6.4, 10.5, 4.0, 2.9
    tw, th, ty = 2.8, 8.6, -D / 2 - 0.6
    assign(cube("Walls", (W, D, wall_h), (0, 0, wall_h / 2), bevel=0.04), mats["plaster"])
    assign(cube("Plinth", (W + 0.3, D + 0.3, 0.6), (0, 0, 0.3), bevel=0.03), mats["stone"])
    gable_roof({**mats, "logs": mats["plaster"]}, W, D, wall_h, rise, overhang=0.35)
    assign(cube("Tower", (tw, tw, th), (0, ty, th / 2), bevel=0.04), mats["plaster"])
    assign(cube("TowerPlinth", (tw + 0.3, tw + 0.3, 0.6), (0, ty, 0.3), bevel=0.03), mats["stone"])
    assign(cube("Cornice", (tw + 0.4, tw + 0.4, 0.22), (0, ty, th + 0.05), bevel=0.04), mats["trim"])
    # Spire: eight-sided, slim, snow lying on it, with a small gold cross.
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=tw * 0.62, radius2=0.04, depth=6.6, location=(0, ty, th + 0.16 + 3.3),
                                    rotation=(0, 0, deg(22.5)))
    assign(bpy.context.object, mats["snow"])
    cross = gold("Cross", roughness=0.3)
    assign(cube("CrossPost", (0.09, 0.09, 1.0), (0, ty, th + 6.76 + 0.45), bevel=0.01), cross)
    assign(cube("CrossBar", (0.52, 0.09, 0.09), (0, ty, th + 6.76 + 0.62), bevel=0.01), cross)
    # Door with a lantern above it, a round window, and the belfry glowing on every side.
    assign(cube("Door", (1.25, 0.12, 2.4), (0, ty - tw / 2 - 0.03, 1.8), bevel=0.03), mats["trim"])
    for i in range(3):
        assign(cube("Step", (2.2 - i * 0.3, 0.5, 0.2), (0, ty - tw / 2 - 0.25 - (2 - i) * 0.42, 0.1 + i * 0.2), bevel=0.02), mats["stone"])
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.08, vertices=32, location=(0, ty - tw / 2 - 0.02, 4.6), rotation=(deg(90), 0, 0))
    assign(bpy.context.object, mats["glow"])
    window(mats, 0, ty - tw / 2, 7.15, 0.75, 1.3, "-y")
    window(mats, tw / 2, ty, 7.15, 0.75, 1.3, "+x")
    window(mats, -tw / 2, ty, 7.15, 0.75, 1.3, "-x")
    for y in (-3.0, 0.0, 3.0):
        window(mats, W / 2, y, 2.5, 0.8, 2.0, "+x")
        window(mats, -W / 2, y, 2.5, 0.8, 2.0, "-x")
    for x in (-2.25, 2.25):
        window(mats, x, -D / 2, 2.5, 0.8, 2.0, "-y")
    point_light("DoorLantern", (0, ty - tw / 2 - 0.5, 3.4), 220, (1.0, 0.68, 0.32), radius=0.1)
    sphere("DoorLamp", 0.1, (0, ty - tw / 2 - 0.25, 3.4), segments=12).visible_shadow = False
    assign(bpy.data.objects["DoorLamp"], mats["lantern"])
    for sgn in (-1, 1):
        point_light("NaveGlow", (sgn * (W / 2 + 1.0), 0, 2.2), 240, (1.0, 0.64, 0.3), radius=0.6)
    return new_objects(before)


def lathe(name, profile, segments=40, start=0.0, sweep=2 * math.pi, thickness=0.0, subsurf=2):
    """Spins a (radius, height) profile round the vertical axis. A partial sweep leaves the
    shape open (a veil or cloak that shows what is inside)."""
    closed = abs(sweep - 2 * math.pi) < 1e-6
    cols = segments if closed else segments + 1
    verts, faces = [], []
    for c in range(cols):
        a = start + sweep * c / segments
        for r, z in profile:
            verts.append((r * math.cos(a), r * math.sin(a), z))
    n = len(profile)
    for c in range(segments):
        c2 = (c + 1) % cols
        for k in range(n - 1):
            faces.append((c * n + k, c2 * n + k, c2 * n + k + 1, c * n + k + 1))
    o = mesh_object(name, verts, faces)
    if thickness:
        sol = o.modifiers.new("Thick", "SOLIDIFY")
        sol.thickness = thickness
    if subsurf:
        sub = o.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = sub.render_levels = subsurf
    return o


def cloth(name, color, rough=0.62):
    m = principled(name, color, roughness=rough, sheen=0.25)
    add_bump(m, scale=70.0, strength=0.12, detail=3.0)
    return m


def sphere(name, radius, loc, scale=(1, 1, 1), segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segments, ring_count=segments // 2)
    o = smooth(bpy.context.object)
    o.name = name
    o.scale = scale
    return o


def tube(name, points, radius, mat):
    o = curve_tube(name, points, radius, resolution=12)
    o.data.materials.append(mat)
    return o


def stand(objs, loc, yaw, lean=0.0):
    """Parents a group's parts to one point so it can be placed, turned and inclined."""
    root = bpy.data.objects.new("Group", None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    root.location = loc
    root.rotation_euler = (deg(lean), 0, deg(yaw))
    return root


SKIN = (0.5, 0.29, 0.2)


def manger(mats, rng):
    """A rough wooden crib filled with straw, and the child wrapped in swaddling cloths."""
    before = set(bpy.data.objects)
    for sgn in (-1, 1):
        for tilt in (-1, 1):
            leg = cube("Leg", (0.07, 0.07, 0.95), (sgn * 0.4, tilt * 0.02, 0.4), bevel=0.01)
            turn(leg, (sgn * 0.4, tilt * 0.02, 0.4), (deg(tilt * 32), 0, 0))
            assign(leg, mats["timber"])
    for tilt in (-1, 1):
        board = cube("Side", (1.12, 0.035, 0.34), (0, tilt * 0.2, 0.66), bevel=0.008)
        turn(board, (0, tilt * 0.2, 0.66), (deg(-tilt * 24), 0, 0))
        assign(board, mats["timber"])
    for sgn in (-1, 1):
        assign(cube("End", (0.035, 0.42, 0.3), (sgn * 0.55, 0, 0.67), bevel=0.008), mats["timber"])
    bed = sphere("StrawBed", 0.5, (0, 0, 0.68), scale=(1.05, 0.42, 0.24))
    assign(bed, mats["straw"])
    straw(bed, 3200, 0.1, seed=3)
    bundle = sphere("Swaddling", 0.5, (0.03, 0, 0.9), scale=(0.62, 0.3, 0.26))
    bundle.rotation_euler = (0, deg(-9), 0)
    assign(bundle, mats["swaddle"])
    head = sphere("ChildHead", 0.082, (-0.3, 0, 0.97), scale=(1.0, 0.95, 0.95))
    assign(head, mats["skin"])
    wrap = lathe("HeadCloth", [(0.0, 0.1), (0.06, 0.085), (0.092, 0.03), (0.096, -0.04)], thickness=0.012,
                 start=deg(40), sweep=deg(280), subsurf=1)
    wrap.location = (-0.3, 0, 0.97)
    wrap.rotation_euler = (0, deg(-70), 0)
    assign(wrap, mats["swaddle"])
    return new_objects(before)


def straw(obj, count, length, seed=1):
    obj.modifiers.new("Straw", "PARTICLE_SYSTEM")
    ps = obj.particle_systems[0]
    ps.seed = seed
    pt = ps.settings
    pt.type = "HAIR"
    pt.count = count
    pt.hair_length = length
    pt.emit_from = "FACE"
    pt.use_advanced_hair = True
    pt.normal_factor = 0.02
    pt.factor_random = 0.09
    pt.child_type = "SIMPLE"
    pt.rendered_child_count = 3
    pt.child_radius = 0.06
    pt.root_radius = 1.0
    pt.tip_radius = 0.6
    pt.radius_scale = 0.012
    pt.material_slot = obj.material_slots[0].name
    if obj.material_slots[0].name == "StrawFloor":
        obj.data.materials.append(bpy.data.materials["Straw"])
        pt.material_slot = "Straw"


def stable(mats, rng, people):
    """An open-fronted timber stable under a blanket of snow, lit by a single lantern."""
    before = set(bpy.data.objects)
    W, D, H, rise = 4.8, 3.3, 2.45, 1.45
    # Posts and beams.
    for sx in (-1, 1):
        for sy in (-1, 1):
            post = cube("Post", (0.2, 0.2, H), (sx * (W / 2 - 0.1), sy * (D / 2 - 0.1), H / 2), bevel=0.02)
            turn(post, (sx * (W / 2 - 0.1), sy * (D / 2 - 0.1), 0), (deg(rng.uniform(-1.5, 1.5)), deg(rng.uniform(-1.5, 1.5)), 0))
            assign(post, mats["timber"])
    for sy in (-1, 1):
        assign(cube("Beam", (W + 0.3, 0.2, 0.2), (0, sy * (D / 2 - 0.1), H - 0.02), bevel=0.02), mats["timber"])
    # Back wall, and half-height side walls, of uneven vertical planks.
    x = -W / 2 + 0.14
    while x < W / 2 - 0.1:
        w = rng.uniform(0.22, 0.34)
        plank = cube("Plank", (w - 0.02, 0.05, H - rng.uniform(0.0, 0.08)), (x + w / 2, D / 2 - 0.06, H / 2), bevel=0.006)
        assign(plank, mats["planks"])
        x += w
    # A solid backing, so no night shows through the gaps between the planks.
    assign(cube("Backing", (W - 0.2, 0.04, H - 0.05), (0, D / 2 - 0.01, H / 2)), mats["timber"])
    for sx in (-1, 1):
        y = -D / 2 + 0.6
        while y < D / 2 - 0.1:
            w = rng.uniform(0.22, 0.34)
            hgt = 1.25 + rng.uniform(-0.06, 0.06)
            plank = cube("Plank", (0.05, w - 0.02, hgt), (sx * (W / 2 - 0.06), y + w / 2, hgt / 2), bevel=0.006)
            assign(plank, mats["planks"])
            y += w
    gable_roof({**mats, "logs": mats["planks"], "trim": mats["timber"]}, W, D, H + 0.08, rise, overhang=0.55)
    # Straw underfoot.
    floor = cube("StrawFloor", (W - 0.35, D - 0.1, 0.06), (0, 0.0, 0.02), bevel=0.025)
    assign(floor, mats["earth"])
    straw(floor, 16000, 0.17, seed=5)
    # The lantern, and the soft light that seems to come from the manger itself.
    tube("LanternHook", [(0, -0.35, H - 0.1), (0, -0.35, H - 0.42)], 0.008, mats["timber"])
    lamp = sphere("Lantern", 0.085, (0, -0.35, H - 0.5), segments=16)
    assign(lamp, mats["lantern"])
    lamp.visible_shadow = False
    point_light("LanternLight", (0, -0.35, H - 0.5), 620, (1.0, 0.66, 0.3), radius=0.1)
    point_light("MangerLight", (0.0, -0.75, 1.12), 95, (1.0, 0.85, 0.62), radius=0.1)
    # Light reaching out over the snow in front.
    area_light("Spill", (0, -D / 2 - 0.3, 1.9), (0, -D / 2 - 3.5, 0.0), 260, 2.2, (1.0, 0.68, 0.34))

    parts = new_objects(before)
    parts.append(stand(manger(mats, rng), (0.0, -0.55, 0.05), 0))
    # Mary kneels at the manger's side, Joseph stands watch at the other; both turned to the child.
    for figure, loc, yaw in zip(people, [(-1.08, -0.62, 0.09), (1.14, -0.3, 0.09)], [68, -56]):
        figure.location = loc
        figure.rotation_euler = (0, 0, deg(yaw))
        parts.append(figure)
    return stand(parts, tuple(STABLE), STABLE_YAW)


def anchors(scene, cam):
    """Where the stable lands in the picture, as fractions of its width and height.
    countdown.js hangs the Star of Bethlehem over it, so copy these into SCENE there."""
    from bpy_extras.object_utils import world_to_camera_view
    for label, p in [("roof", STABLE + Vector((0, 0, 4.0))), ("manger", STABLE + Vector((0, -0.55, 0.9))),
                     ("ground", STABLE + Vector((0, -1.6, 0.0)))]:
        v = world_to_camera_view(scene, cam, p)
        print(f"[art] anchor {label} x={v.x:.4f} y={1 - v.y:.4f}")


def land():
    reset()
    setup_render(res=1440, samples=224)
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y = 2560, 1440
    s.view_settings.look = "AgX - Medium High Contrast"
    s.view_settings.exposure = 0.0
    world(0.035, 0.065, 0.16, 0.5)                 # night-sky ambient
    rng = random.Random(25)
    people = figures.people()                      # first, while the scene is empty (cloth is draped on them)

    terrain()
    mountains()

    # Starlight from high behind the stable (the Star of Bethlehem hangs above it), plus a faint
    # cool fill from the front so shaded snow keeps its shape.
    sun("Starlight", (-0.3, -0.78, -0.55), 2.4, (0.66, 0.77, 1.0), angle=1.5)
    sun("SkyFill", (0.25, 0.8, -0.55), 0.22, (0.5, 0.62, 1.0), angle=40)

    # Forest: four fir shapes, instanced many times.
    fir_mats = {"needles": hero.needle_material(), "snow": snow_material("BoughSnow"),
                "bark": principled("Bark", (0.035, 0.02, 0.012), roughness=0.9)}
    firs = []
    for i, (H, R) in enumerate([(9.5, 2.5), (12.0, 2.8), (7.5, 2.2), (14.0, 3.1)]):
        firs.append(into_collection(fir(rng, fir_mats, H=H, R=R, tiers=11 + 2 * i), f"Fir{i}"))

    def scatter(count, x_range, y_range, keep, scale=(0.75, 1.25)):
        placed = 0
        tries = 0
        while placed < count and tries < count * 30:
            tries += 1
            x = rng.uniform(*x_range)
            y = rng.uniform(*y_range)
            if not keep(x, y):
                continue
            instance(rng.choice(firs), (x, y, ground_height(x, y) - 0.25), rng.uniform(0, 6.28), rng.uniform(*scale))
            placed += 1

    # The chapel stands at the heart of the village, far enough back that its spire stays clear
    # of the clock that countdown.js sets over the left of the picture; cabins gather round it.
    homes = [(-7, 62, 8), (-31, 30, 16), (-14, 22, 22), (-47, 48, 14), (-26, 54, 6), (-40, 74, 10),
             (13, 60, -4), (27, 40, -14), (43, 54, -18), (24, 76, -6), (58, 78, -14), (-3, 38, 4)]

    def sightline(x, y, tx, ty, width):
        """True when (x, y) stands between the camera and (tx, ty), within `width` of the line of sight."""
        dx, dy = tx - CAM.x, ty - CAM.y
        t = ((x - CAM.x) * dx + (y - CAM.y) * dy) / (dx * dx + dy * dy)
        return 0.0 < t < 1.0 and math.hypot(x - (CAM.x + t * dx), y - (CAM.y + t * dy)) < width

    def clear(x, y):
        if any(math.hypot(x - hx, y - hy) < 10.0 or sightline(x, y, hx, hy, 5.5) for hx, hy, _ in homes):
            return False
        return math.hypot(x - STABLE.x, y - STABLE.y) > 12.0 and not sightline(x, y, STABLE.x, STABLE.y + 14.0, 6.5)

    # A few big firs frame the picture, more stand among the houses, then forested hills.
    for x, y, sc in [(-14.0, -8.0, 1.25), (-19.5, 1.0, 1.0), (13.2, -5.0, 1.1), (17.5, 4.0, 0.9), (-26.0, 12.0, 1.1)]:
        instance(firs[int(abs(x)) % 4], (x, y, ground_height(x, y) - 0.25), rng.uniform(0, 6.28), sc)
    scatter(40, (-80, 80), (14, 84), clear)
    scatter(170, (-190, 190), (84, 190), lambda x, y: abs(x) > 6, scale=(0.8, 1.5))
    scatter(260, (-380, 380), (190, 400), lambda x, y: True, scale=(0.9, 1.7))

    # The village.
    mats = {
        "logs": log_material(),
        "plaster": principled("Plaster", (0.72, 0.7, 0.66), roughness=0.85),
        "trim": principled("Trim", (0.035, 0.018, 0.01), roughness=0.7),
        "stone": principled("Stone", (0.11, 0.105, 0.1), roughness=0.9),
        "snow": snow_material("RoofSnow"),
        "glow": principled("WindowGlow", (1.0, 0.72, 0.35), emission=(1.0, 0.6, 0.22), emission_strength=7.5),
        "lantern": principled("LanternGlow", (1.0, 0.8, 0.5), emission=(1.0, 0.7, 0.3), emission_strength=30),
    }
    add_bump(mats["stone"], scale=9.0, strength=0.6)
    cabins = [into_collection(cabin(mats, rng, W=w, D=d, wall_h=hh, rise=r), f"Cabin{i}")
              for i, (w, d, hh, r) in enumerate([(7.0, 5.5, 2.9, 2.3), (8.5, 6.0, 3.0, 2.7), (6.0, 5.0, 2.8, 2.6)])]
    church = into_collection(chapel(mats), "Chapel")
    for i, (x, y, yaw) in enumerate(homes):
        coll = church if i == 0 else cabins[i % 3]
        instance(coll, (x, y, ground_height(x, y) - 0.12), deg(yaw), 0.8 if i == 0 else 1.0)

    nat = {
        "timber": principled("Timber", (0.06, 0.03, 0.015), roughness=0.85),
        "planks": log_material(),
        "straw": principled("Straw", (0.5, 0.36, 0.12), roughness=0.7),
        "earth": principled("StrawFloor", (0.3, 0.2, 0.07), roughness=0.9),
        "snow": mats["snow"],
        "lantern": mats["lantern"],
        "skin": principled("ChildSkin", SKIN, roughness=0.55),
        "swaddle": cloth("Swaddling", (0.86, 0.83, 0.76)),
    }
    add_bump(nat["timber"], scale=14.0, strength=0.5, detail=8.0)
    bsdf(nat["planks"]).inputs["Base Color"].default_value = (0.075, 0.04, 0.02, 1)
    stable(nat, random.Random(7), people)

    cam = camera(tuple(CAM), (0, 0.9, 6.8), lens=30)
    bpy.context.view_layer.update()
    anchors(s, cam)
    render(os.path.join(OUT, "countdown-land.png"))


land()
