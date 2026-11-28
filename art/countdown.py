"""Countdown-to-Christmas scenery, rendered for countdown.js:

  countdown-land.png   Bethlehem on the night of the Nativity (transparent sky): an animal
                       shelter of rough limestone and timber against a rocky bank, lit by clay oil
                       lamps — Mary, Joseph and the child in a stone manger, three shepherds and
                       their sheep — with the terraced Judean hills, olive trees, the shepherds'
                       fire and the flat-roofed village behind.

What it tries to get right for first-century Judea: no snow; stone, mud and timber, not planed
boards; a stone feeding trough for the manger; oil lamps, not glass lanterns; undyed and
earth-dyed wool; fat-tailed Awassi sheep; shepherds (Luke 2) and no Magi, who came later
(Matthew 2). The Star of Bethlehem and the night sky are drawn live by countdown.js; this script
prints where the shelter sits in the picture so the star can hang over it.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403
import figures  # noqa: E402  (Mary, Joseph and the shepherds)

from mathutils import Euler, Matrix, noise  # noqa: E402

OUT = out_dir()
CAM = Vector((0.0, -15.6, 1.45))
LOOK = Vector((-3.24, -0.34, 2.68))        # a little left of the shelter, which sits right of centre
ROOF = 2.75                                 # height of the shelter's eaves at the front


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


def turn(obj, center, rotation):
    """Rotates an object about `center`. (common.cube() bakes its position into the mesh, so its
    origin is the world origin and a plain rotation_euler would swing it round that instead.)"""
    c = Matrix.Translation(Vector(center))
    obj.matrix_world = c @ Euler(rotation).to_matrix().to_4x4() @ c.inverted() @ obj.matrix_world
    return obj


def mesh_object(name, verts, faces, smooth_shade=True, edges=()):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, list(edges), faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if smooth_shade:
        for p in me.polygons:
            p.use_smooth = True
    return o


def lathe(name, profile, segments=40, subsurf=2):
    """Spins a (radius, height) profile round the vertical axis."""
    verts, faces = [], []
    for c in range(segments):
        a = 2 * math.pi * c / segments
        for r, z in profile:
            verts.append((r * math.cos(a), r * math.sin(a), z))
    n = len(profile)
    for c in range(segments):
        c2 = (c + 1) % segments
        for k in range(n - 1):
            faces.append((c * n + k, c2 * n + k, c2 * n + k + 1, c * n + k + 1))
    o = mesh_object(name, verts, faces)
    if subsurf:
        sub = o.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = sub.render_levels = subsurf
    return o


def sphere(name, radius, loc, scale=(1, 1, 1), segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segments, ring_count=segments // 2)
    o = smooth(bpy.context.object)
    o.name = name
    o.scale = scale
    return o


def tube(name, points, radius, mat, resolution=12):
    o = curve_tube(name, points, radius, resolution=resolution)
    o.data.materials.append(mat)
    return o


def group(objs, loc=(0, 0, 0), yaw=0.0, scale=1.0):
    """Parents parts to one point so the whole thing can be placed and turned."""
    root = bpy.data.objects.new("Group", None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    root.location = loc
    root.rotation_euler = (0, 0, deg(yaw))
    root.scale = (scale, scale, scale)
    return root


def strands(obj, mat, count, length, seed=1, children=4, thickness=0.012, curl=0.0, group_name=None, random_dir=0.8):
    """Straw, thatch, dry grass, wool, leaves: fine strands growing from an object's faces."""
    if mat.name not in [s.name for s in obj.material_slots]:
        obj.data.materials.append(mat)
    obj.modifiers.new("Strands", "PARTICLE_SYSTEM")
    ps = obj.particle_systems[-1]
    ps.seed = seed
    if group_name:
        ps.vertex_group_density = group_name
    pt = ps.settings
    pt.type = "HAIR"
    pt.count = count
    pt.hair_length = length
    pt.emit_from = "FACE"
    pt.use_advanced_hair = True
    # A strand's length follows the speed it "leaves" the surface with, so keep that speed
    # constant and let `random_dir` (0 = straight out, 1 = any direction) only steer it.
    pt.normal_factor = 0.1 * (1 - random_dir)
    pt.factor_random = 0.1 * random_dir
    pt.child_type = "SIMPLE"
    pt.rendered_child_count = children
    pt.child_radius = 0.06
    if curl:
        pt.kink = "CURL"
        pt.kink_amplitude = curl
        pt.kink_frequency = 3.0
    pt.root_radius = 1.0
    pt.tip_radius = 0.5
    pt.radius_scale = thickness
    pt.material_slot = mat.name


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def varied(name, dark, light, roughness=0.9, bump=0.6, bump_scale=14.0, tex_scale=3.0, per_object=0.45):
    """A natural surface: two tones mixed by noise, a little different on every object, and rough."""
    m = principled(name, light, roughness=roughness, specular=0.25)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = tex_scale
    tex.inputs["Detail"].default_value = 8.0
    info = nt.nodes.new("ShaderNodeObjectInfo")
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "MULTIPLY_ADD"
    add.inputs[1].default_value = per_object
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(tc.outputs["Object"], tex.inputs["Vector"])
    nt.links.new(info.outputs["Random"], add.inputs[0])
    nt.links.new(tex.outputs["Fac"], add.inputs[2])
    nt.links.new(add.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Base Color"])
    add_bump(m, scale=bump_scale, strength=bump, detail=10.0)
    return m


def materials():
    return {
        "limestone": varied("Limestone", (0.07, 0.058, 0.044), (0.4, 0.34, 0.26), bump=1.0, bump_scale=26.0, tex_scale=6.0, per_object=0.75),
        "plaster": varied("MudPlaster", (0.3, 0.25, 0.18), (0.52, 0.45, 0.34), bump=0.35, bump_scale=6.0, tex_scale=1.4),
        "rock": varied("Rock", (0.08, 0.07, 0.055), (0.34, 0.3, 0.23), bump=1.0, bump_scale=9.0, tex_scale=2.6),
        "timber": varied("Timber", (0.07, 0.04, 0.02), (0.2, 0.12, 0.06), bump=0.7, bump_scale=30.0, tex_scale=9.0),
        "bark": varied("OliveBark", (0.08, 0.065, 0.05), (0.26, 0.22, 0.17), bump=1.0, bump_scale=18.0, tex_scale=6.0),
        "thatch": varied("Thatch", (0.12, 0.085, 0.04), (0.34, 0.26, 0.12), bump=0.9, bump_scale=40.0, tex_scale=10.0),
        "earth": varied("Earth", (0.14, 0.105, 0.07), (0.3, 0.24, 0.16), bump=0.5, bump_scale=30.0, tex_scale=10.0),
        "clay": varied("Terracotta", (0.3, 0.13, 0.06), (0.5, 0.24, 0.12), roughness=0.8, bump=0.2),
        "straw": principled("Straw", (0.52, 0.38, 0.14), roughness=0.7),
        "dry_grass": principled("DryGrass", (0.36, 0.3, 0.14), roughness=0.8),
        "olive_leaf": principled("OliveLeaf", (0.11, 0.15, 0.1), roughness=0.5, sheen=0.4),
        "cypress": principled("Cypress", (0.015, 0.04, 0.022), roughness=0.7),
        "wool": varied("SheepWool", (0.3, 0.27, 0.21), (0.56, 0.51, 0.42), roughness=0.95, bump=1.0, bump_scale=130.0, tex_scale=30.0),
        "sheep_face": principled("SheepFace", (0.12, 0.07, 0.04), roughness=0.8),
        "dark": principled("Doorway", (0.01, 0.008, 0.006), roughness=1.0),
        "window": principled("LampWindow", (1.0, 0.7, 0.35), emission=(1.0, 0.55, 0.2), emission_strength=14.0),
        "flame": principled("Flame", (1.0, 0.75, 0.4), emission=(1.0, 0.52, 0.16), emission_strength=70.0),
        "fire": principled("Fire", (1.0, 0.6, 0.2), emission=(1.0, 0.4, 0.08), emission_strength=45.0),
        "child_skin": figures.skin_material("ChildSkin", (0.5, 0.3, 0.22)),
        "child_hair": principled("ChildHair", (0.02, 0.012, 0.008), roughness=0.5),
        "swaddle": figures.cloth_material("Swaddling", (0.5, 0.45, 0.36)),
    }


# ---------------------------------------------------------------------------
# Land
# ---------------------------------------------------------------------------

def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


TOWN = Vector((-46.0, 118.0))             # the village on its ridge
FIRE = Vector((-13.0, 30.0))              # where the other shepherds keep watch


def ground_height(x, y):
    r = math.hypot(x, y - 0.6)
    rough = 0.22 * noise.noise(Vector((x * 0.09, y * 0.09, 0.3))) + 0.06 * noise.noise(Vector((x * 0.4, y * 0.4, 5.0)))
    h = rough * smoothstep((r - 4.6) / 6.0)
    # The rocky bank the shelter is built against: behind it and running off to the right.
    h += 3.4 * smoothstep((y - 2.5) / 2.4) * smoothstep((x + 4.4) / 1.8) * (1 - 0.5 * smoothstep((y - 30) / 40))
    # Away from the shelter the ground falls into a shallow valley, then climbs in broad terraces.
    d = math.hypot(x, y)
    h -= 3.2 * smoothstep((d - 12) / 30) * smoothstep((-x + 4) / 12)
    hills = noise.noise(Vector((x * 0.006, y * 0.006, 2.0))) * 0.5 + 0.5
    climb = hills * max(0.0, y - 55.0) * 0.085 + 1.6 * noise.noise(Vector((x * 0.02, y * 0.02, 9.0))) * smoothstep((d - 30) / 40)
    climb += 12.5 * math.exp(-((x - TOWN.x) ** 2 + (y - TOWN.y) ** 2) / (2 * 44.0 ** 2))
    terraced = round(climb / 1.4) * 1.4
    h += climb + 0.55 * (terraced - climb) * smoothstep((d - 28) / 20)
    # The watch fire has a level patch.
    near_fire = 1 - smoothstep((math.hypot(x - FIRE.x, y - FIRE.y) - 2.5) / 6.0)
    return h * (1 - near_fire) + FIRE_LEVEL * near_fire


FIRE_LEVEL = -2.6


def terrain(mats):
    nx, ny = 360, 320
    verts, faces = [], []
    for j in range(ny + 1):
        y = CAM.y - 3.0 + 640.0 * (j / ny) ** 2.3
        half = 34.0 + (y - CAM.y) * 0.95
        for i in range(nx + 1):
            x = -half * 1.25 + 2.25 * half * i / nx
            inside = NEAR[0] + 1.5 < x < NEAR[1] - 1.5 and NEAR[2] + 1.5 < y < NEAR[3] - 1.5
            verts.append((x, y, ground_height(x, y) - (0.35 if inside else 0.0)))     # tucked under the detailed patch
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_object("Terrain", verts, faces)
    # Dry earth where it is level, bare limestone where it is steep.
    m = varied("Ground", (0.06, 0.046, 0.03), (0.22, 0.175, 0.115), bump=0.9, bump_scale=3.0, tex_scale=0.5, per_object=0.0)
    nt = m.node_tree
    # Grit and small pale stones bedded in the soil, and a fine roughness you can see up close.
    tcg = nt.nodes.new("ShaderNodeTexCoord")
    grit = nt.nodes.new("ShaderNodeTexVoronoi")
    grit.inputs["Scale"].default_value = 9.0
    speck = nt.nodes.new("ShaderNodeValToRGB")
    speck.color_ramp.elements[0].position = 0.0
    speck.color_ramp.elements[0].color = (1, 1, 1, 1)
    speck.color_ramp.elements[1].position = 0.09
    speck.color_ramp.elements[1].color = (0, 0, 0, 1)
    pale = nt.nodes.new("ShaderNodeMixRGB")
    pale.inputs["Color2"].default_value = (0.3, 0.27, 0.21, 1)
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 60.0
    fine.inputs["Detail"].default_value = 8.0
    fine_bump = nt.nodes.new("ShaderNodeBump")
    fine_bump.inputs["Strength"].default_value = 0.6
    fine_bump.inputs["Distance"].default_value = 0.02
    nt.links.new(tcg.outputs["Object"], grit.inputs["Vector"])
    nt.links.new(tcg.outputs["Object"], fine.inputs["Vector"])
    nt.links.new(grit.outputs["Distance"], speck.inputs["Fac"])
    nt.links.new(speck.outputs["Color"], pale.inputs["Fac"])
    nt.links.new(bsdf(m).inputs["Base Color"].links[0].from_socket, pale.inputs["Color1"])
    nt.links.new(pale.outputs["Color"], bsdf(m).inputs["Base Color"])
    nt.links.new(fine.outputs["Fac"], fine_bump.inputs["Height"])
    nt.links.new(bsdf(m).inputs["Normal"].links[0].from_socket, fine_bump.inputs["Normal"])
    nt.links.new(fine_bump.outputs["Normal"], bsdf(m).inputs["Normal"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    steep = nt.nodes.new("ShaderNodeValToRGB")
    steep.color_ramp.elements[0].position = 0.78
    steep.color_ramp.elements[0].color = (1, 1, 1, 1)
    steep.color_ramp.elements[1].position = 0.93
    steep.color_ramp.elements[1].color = (0, 0, 0, 1)
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.inputs["Color2"].default_value = (0.26, 0.23, 0.18, 1)
    base = bsdf(m).inputs["Base Color"].links[0].from_socket
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], steep.inputs["Fac"])
    nt.links.new(steep.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(base, mix.inputs["Color1"])
    nt.links.new(mix.outputs["Color"], bsdf(m).inputs["Base Color"])
    assign(o, m)
    return o


NEAR = (-34.0, 16.0, -19.0, 30.0)          # x0, x1, y0, y1 of the finely modelled ground


def near_ground(mats):
    """The ground close to the camera, in detail: trodden earth, ruts, hollows and grit."""
    x0, x1, y0, y1 = NEAR
    nx, ny = 560, 540
    verts, faces = [], []
    for j in range(ny + 1):
        y = y0 + (y1 - y0) * j / ny
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            p = Vector((x, y, 0.0))
            micro = (0.05 * noise.noise(p * 0.9 + Vector((3, 0, 0))) + 0.022 * noise.noise(p * 3.1) + 0.008 * noise.noise(p * 11.0))
            # The beaten path the shepherds came by, winding up from the valley to the shelter.
            path_x = -1.2 - 0.55 * (y + 1.0) * 0.0 + 2.2 * math.sin((y + 14.0) * 0.16) - 0.25 * (y + 15.0) * (1 if y < -1 else 0) * 0.0
            on_path = 1 - smoothstep((abs(x - path_x) - 0.55) / 0.8) if y < -0.8 else 0.0
            verts.append((x, y, ground_height(x, y) + 0.02 + micro * (1 - 0.6 * on_path) - 0.035 * on_path))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_object("NearGround", verts, faces)
    assign(o, bpy.data.materials["Ground"])
    return o


def rock_face(mats):
    """The weathered limestone bank behind the shelter, in finer detail than the terrain."""
    nx, nz = 150, 44
    verts, faces = [], []
    for k in range(nz + 1):
        f = k / nz
        for i in range(nx + 1):
            x = -4.6 + 14.0 * i / nx
            z = -0.2 + 4.3 * f
            lean = 2.55 + 1.5 * f ** 1.6                                    # leaning back as it rises
            bulge = 0.4 * noise.noise(Vector((x * 0.45, z * 0.7, 1.3))) + 0.2 * noise.noise(Vector((x * 1.7, z * 2.2, 4.0)))
            # Limestone lies in beds: horizontal ledges, broken by cracks.
            ledge = 0.16 * math.sin(z * 6.0 + 1.1 * noise.noise(Vector((x * 0.3, 0, 7.0)))) ** 3
            crack = -0.14 * max(0.0, noise.noise(Vector((x * 2.6, z * 0.5, 11.0))) - 0.45)
            fade = smoothstep((x + 4.6) / 1.5)
            verts.append((x, lean - (bulge + ledge + crack) * fade + (1 - fade) * 1.6, z * (0.2 + 0.8 * fade)))
    for k in range(nz):
        for i in range(nx):
            a = k * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_object("RockFace", verts, faces)
    assign(o, mats["rock"])
    return o


def boulder(rng, mat, size):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=size)
    o = bpy.context.object
    o.name = "Stone"
    offset = Vector((rng.random() * 9, rng.random() * 9, 0))
    for v in o.data.vertices:
        v.co *= 1 + 0.32 * noise.noise(v.co * (1.6 / size) + offset)
        v.co.z *= 0.62
    smooth(o)
    assign(o, mat)
    return o


# ---------------------------------------------------------------------------
# Trees
# ---------------------------------------------------------------------------

def olive(rng, mats, size=1.0):
    """An old olive: a short, twisted trunk dividing into a few heavy limbs under a rounded,
    grey-green crown."""
    before = set(bpy.data.objects)
    verts, edges, radii, tips = [(0.0, 0.0, -0.1)], [], [0.26 * size], []

    def grow(parent, pos, heading, length, radius, depth):
        for s in range(3):
            heading = (heading + Vector((rng.uniform(-0.28, 0.28), rng.uniform(-0.28, 0.28), rng.uniform(-0.05, 0.12)))).normalized()
            pos = pos + heading * length / 3
            verts.append(tuple(pos))
            radii.append(radius * (1 - 0.14 * (s + 1)))
            edges.append((parent, len(verts) - 1))
            parent = len(verts) - 1
        if depth == 0:
            tips.append(pos)
            return
        for _ in range(rng.choice([2, 2, 3])):
            a = rng.uniform(0, 6.28)
            side = Vector((math.cos(a), math.sin(a), rng.uniform(0.15, 0.6)))
            grow(parent, pos, (heading * 0.55 + side * 0.75).normalized(), length * 0.74, radius * 0.6, depth - 1)

    grow(0, Vector((0, 0, -0.1)), Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 1)), 1.5 * size, 0.24 * size, 3)
    wood = mesh_object("OliveWood", verts, [], edges=edges)
    wood.modifiers.new("Skin", "SKIN")
    for i, r in enumerate(radii):
        wood.data.skin_vertices[0].data[i].radius = (r, r * rng.uniform(0.8, 1.0))
    wood.data.skin_vertices[0].data[0].use_root = True
    sub = wood.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = 1
    assign(wood, mats["bark"])
    for i, tip in enumerate(tips):
        r = rng.uniform(0.55, 0.9) * size
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=tip + Vector((0, 0, r * 0.25)))
        crown = bpy.context.object
        crown.name = "OliveCrown"
        crown.scale = (1.0, 1.0, 0.72)
        assign(crown, mats["olive_leaf"])
        strands(crown, mats["olive_leaf"], 1400, 0.075 * size, seed=i + 1, children=6, thickness=0.012, random_dir=0.5)
        for k in range(2):                                             # an uneven crown, not a ball
            r2 = r * rng.uniform(0.55, 0.8)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r2, location=tip + Vector((rng.uniform(-r, r), rng.uniform(-r, r), rng.uniform(-0.1, 0.5) * r)))
            extra = bpy.context.object
            extra.name = "OliveCrown"
            extra.scale = (1.0, 1.0, 0.7)
            assign(extra, mats["olive_leaf"])
            strands(extra, mats["olive_leaf"], 800, 0.075 * size, seed=i * 3 + k, children=6, thickness=0.012, random_dir=0.5)
    return new_objects(before)


def cypress(mats, height=8.0):
    before = set(bpy.data.objects)
    profile = [(0.0, 0.0), (0.42, 0.25), (0.74, 1.4), (0.7, height * 0.5), (0.42, height * 0.82), (0.0, height + 0.3)]
    o = lathe("Cypress", profile, segments=20, subsurf=1)
    assign(o, mats["cypress"])
    strands(o, mats["cypress"], 9000, 0.3, children=4, thickness=0.018, random_dir=0.2)
    return new_objects(before)


# ---------------------------------------------------------------------------
# Buildings
# ---------------------------------------------------------------------------

def stone_texture():
    tex = bpy.data.textures.get("StoneChips") or bpy.data.textures.new("StoneChips", "CLOUDS")
    tex.noise_scale = 0.16
    tex.noise_depth = 3
    return tex


def stone_wall(mats, rng, start, end, height, thickness=0.42, ragged=True):
    """A dry-stone wall: courses of field stone roughly squared with a hammer — no two alike,
    none quite level, the top course broken."""
    a, b = Vector(start), Vector(end)
    along = (b - a)
    along.z = 0.0
    length = along.length
    along.normalize()
    across = Vector((-along.y, along.x, 0))
    yaw = math.atan2(along.y, along.x)
    heights = []
    while sum(heights) < height:
        heights.append(rng.uniform(0.13, 0.3))
    z = 0.0
    for course, ch in enumerate(heights):
        last = course == len(heights) - 1
        s = -rng.uniform(0.0, 0.3) if course % 2 else 0.0
        while s < length:
            bl = rng.uniform(0.16, 0.72)
            if last and ragged and rng.random() < 0.4:
                s += bl
                continue
            high = ch * rng.uniform(0.86, 1.0)
            centre = a + along * min(length, s + bl / 2) + across * rng.uniform(-0.035, 0.035) + Vector((0, 0, z + high / 2))
            block = cube("Block", (bl - 0.02, thickness * rng.uniform(0.8, 1.08), high - 0.012), tuple(centre), bevel=0.05)
            # Knocked into shape with a hammer: faces that are never quite flat.
            sub = block.modifiers.new("Subsurf", "SUBSURF")
            sub.subdivision_type = "SIMPLE"
            sub.levels = sub.render_levels = 2
            chip = block.modifiers.new("Chipped", "DISPLACE")
            chip.texture = stone_texture()
            chip.texture_coords = "GLOBAL"
            chip.strength = 0.05
            chip.mid_level = 0.5
            turn(block, tuple(centre), (deg(rng.uniform(-4, 4)), deg(rng.uniform(-4, 4)), yaw + deg(rng.uniform(-5, 5))))
            assign(block, mats["limestone"])
            s += bl
        z += ch


def shelter(mats, rng):
    """A lean-to for animals: two dry-stone side walls against the rock, forked posts and beams,
    and a roof of poles, brushwood and reed."""
    before = set(bpy.data.objects)
    W, front, back = 5.3, -0.85, 2.7
    stone_wall(mats, rng, (-W / 2, front + 0.7, 0), (-W / 2, back, 0), 2.2)
    stone_wall(mats, rng, (W / 2, front + 0.3, 0), (W / 2, back, 0), 2.35)
    stone_wall(mats, rng, (W / 2 - 0.2, front + 0.3, 0), (W / 2 + 1.9, front + 0.55, 0), 0.9)                   # a low fold wall
    # The back is built up in stone against the rock, which shows above it.
    stone_wall(mats, rng, (-W / 2 + 0.2, back - 0.12, 0), (W / 2 - 0.2, back - 0.12, 0), 2.5, thickness=0.36)
    assign(cube("Packing", (W - 0.3, 0.3, 2.4), (0, back + 0.16, 1.2)), mats["earth"])     # earth and rubble behind it
    # Forked posts at the front, a beam across them, another on the rock behind.
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.15)
        tube("Post", [(x, front, -0.1), (x + 0.04 * sx, front + 0.03, 1.1), (x - 0.02 * sx, front, 2.0), (x, front, ROOF - 0.12)], 0.085, mats["timber"])
        for fork in (-1, 1):
            tube("Fork", [(x, front, ROOF - 0.3), (x + fork * 0.13, front, ROOF + 0.12)], 0.05, mats["timber"])
    tube("Beam", [(-W / 2 - 0.5, front, ROOF), (-0.8, front + 0.03, ROOF - 0.04), (1.0, front - 0.02, ROOF + 0.02), (W / 2 + 0.5, front, ROOF)], 0.085, mats["timber"])
    tube("BackBeam", [(-W / 2 - 0.3, back + 0.1, ROOF + 0.55), (W / 2 + 0.3, back + 0.1, ROOF + 0.55)], 0.08, mats["timber"])
    n = 9
    for i in range(n):
        x = -W / 2 - 0.2 + (W + 0.4) * i / (n - 1) + rng.uniform(-0.08, 0.08)
        tube("Rafter", [(x, front - 0.55 - rng.uniform(0, 0.25), ROOF + 0.02), (x + rng.uniform(-0.05, 0.05), (front + back) / 2, ROOF + 0.36),
                        (x, back + 0.35, ROOF + 0.66)], 0.045, mats["timber"])
    # Brushwood and reed laid over the rafters.
    cy, cz = (front + back) / 2 - 0.1, ROOF + 0.45
    slope = math.atan2(0.62, back - front)
    roof = cube("Thatch", (W + 0.7, back - front + 1.0, 0.16), (0, cy, cz), bevel=0.06)
    smooth(roof, subsurf=1)
    turn(roof, (0, cy, cz), (slope, 0, 0))
    assign(roof, mats["thatch"])
    strands(roof, mats["thatch"], 34000, 0.3, seed=4, children=3, thickness=0.014, random_dir=0.5)
    for i in range(80):
        x = rng.uniform(-W / 2 - 0.5, W / 2 + 0.5)
        y0 = front - 0.5 - rng.uniform(0.0, 0.45)
        tube("Brush", [(x, y0, ROOF + 0.08 + rng.uniform(-0.05, 0.03)), (x + rng.uniform(-0.2, 0.2), y0 + rng.uniform(0.9, 1.8), ROOF + 0.42)],
             rng.uniform(0.008, 0.02), mats["timber"], resolution=3)
    # Trodden earth and straw underfoot, a heap of hay in the corner.
    floor = sphere("Floor", 1.0, (0, 0.75, -0.02), scale=(W / 2 + 0.3, 2.1, 0.05), segments=48)
    assign(floor, mats["earth"])
    strands(floor, mats["straw"], 22000, 0.16, seed=5, children=3)
    hay = sphere("Hay", 0.7, (-1.95, 2.0, 0.2), scale=(1.0, 0.8, 0.55))
    assign(hay, mats["straw"])
    strands(hay, mats["straw"], 6000, 0.22, seed=6, children=3)
    # Water jars by the wall.
    for x, y, s in ((2.05, 2.0, 1.0), (1.6, 2.25, 0.72)):
        jar = lathe("Jar", [(0.0, 0.0), (0.13, 0.0), (0.21, 0.16), (0.24, 0.34), (0.2, 0.52), (0.1, 0.62), (0.09, 0.7), (0.115, 0.73)])
        jar.location, jar.scale = (x, y, 0.0), (s, s, s)
        assign(jar, mats["clay"])
    return new_objects(before)


def oil_lamp(mats, loc, energy):
    """A small clay lamp: a pinched saucer of olive oil with a wick at its lip."""
    x, y, z = loc
    assign(sphere("Lamp", 0.055, (x, y, z + 0.022), scale=(1.15, 0.9, 0.42), segments=20), mats["clay"])
    assign(sphere("LampSpout", 0.022, (x + 0.06, y, z + 0.026), scale=(1.3, 0.8, 0.6), segments=12), mats["clay"])
    flame = sphere("LampFlame", 0.011, (x + 0.072, y, z + 0.062), scale=(0.8, 0.8, 2.1), segments=12)
    assign(flame, mats["flame"])
    flame.visible_shadow = False
    point_light("LampLight", (x + 0.072, y, z + 0.075), energy, (1.0, 0.56, 0.2), radius=0.018)


def manger(mats, rng):
    """A feeding trough cut from a block of limestone, filled with straw; the child wrapped in
    swaddling bands, as Luke describes."""
    before = set(bpy.data.objects)
    L, Wd, base, wall = 1.2, 0.6, 0.34, 0.26
    for sx in (-1, 1):
        s = cube("Footing", (0.3, Wd + 0.1, base - 0.08), (sx * 0.38, 0, (base - 0.08) / 2), bevel=0.04)
        turn(s, (sx * 0.38, 0, 0), (0, 0, deg(rng.uniform(-6, 6))))
        assign(s, mats["limestone"])
    assign(cube("TroughFloor", (L, Wd, 0.14), (0, 0, base), bevel=0.035), mats["limestone"])
    for sy in (-1, 1):
        assign(cube("TroughSide", (L, 0.1, wall), (0, sy * (Wd / 2 - 0.05), base + 0.07 + wall / 2), bevel=0.035), mats["limestone"])
    for sx in (-1, 1):
        assign(cube("TroughEnd", (0.1, Wd, wall), (sx * (L / 2 - 0.05), 0, base + 0.07 + wall / 2), bevel=0.035), mats["limestone"])
    top = base + 0.07 + wall
    bed = sphere("StrawBed", 0.5, (0, 0, top - 0.06), scale=(1.12, 0.52, 0.2))
    assign(bed, mats["straw"])
    strands(bed, mats["straw"], 5200, 0.07, seed=3, children=3)
    # The child: wrapped tightly from shoulders to feet, head resting towards his mother.
    cz = top + 0.16
    bundle = sphere("Swaddling", 0.5, (0.07, 0, cz), scale=(0.56, 0.25, 0.2))
    assign(bundle, mats["swaddle"])
    for i in range(7):                                                 # the bands themselves
        x = -0.12 + i * 0.065
        r = 0.105 * math.sqrt(max(0.05, 1 - ((x - 0.07) / 0.29) ** 2))
        ring = curve_tube("Band", [(x + 0.03 * math.sin(a), 1.22 * r * math.cos(a), cz + 0.98 * r * math.sin(a))
                                   for a in [2 * math.pi * k / 10 for k in range(10)]], 0.012, resolution=4, closed=True)
        ring.data.materials.append(mats["swaddle"])
    assign(sphere("ChildHead", 0.078, (-0.27, 0, cz + 0.045), scale=(1.05, 0.95, 0.98)), mats["child_skin"])
    assign(sphere("ChildHair", 0.079, (-0.286, 0, cz + 0.056), scale=(0.94, 0.93, 0.9), segments=20), mats["child_hair"])
    return new_objects(before)


def house(mats, rng, w, d, h):
    """A village house: thick walls of stone and mud plaster, a flat roof with a low parapet
    (people slept and worked up there), a few small unglazed windows, sometimes an upper room."""
    before = set(bpy.data.objects)
    assign(cube("Walls", (w, d, h), (0, 0, h / 2), bevel=0.07), mats["plaster"])
    for sx, sy, lx, ly in ((0, -1, w, 0.28), (0, 1, w, 0.28), (-1, 0, 0.28, d), (1, 0, 0.28, d)):
        assign(cube("Parapet", (lx, ly, 0.42), (sx * (w / 2 - 0.14), sy * (d / 2 - 0.14), h + 0.2), bevel=0.06), mats["plaster"])
    assign(cube("Door", (0.85, 0.12, 1.75), (rng.uniform(-w * 0.25, w * 0.25), -d / 2 - 0.02, 0.88)), mats["dark"])
    for i in range(rng.choice([1, 2, 2, 3])):
        lit = mats["window"] if rng.random() < 0.7 else mats["dark"]
        if rng.random() < 0.6:
            assign(cube("Window", (0.34, 0.1, 0.5), (rng.uniform(-w * 0.38, w * 0.38), -d / 2 - 0.02, h * rng.uniform(0.55, 0.72))), lit)
        else:
            sx = rng.choice([-1, 1])
            assign(cube("Window", (0.1, 0.34, 0.5), (sx * (w / 2 + 0.02), rng.uniform(-d * 0.3, d * 0.3), h * rng.uniform(0.55, 0.72))), lit)
    if rng.random() < 0.45:                                             # the "upper room"
        uw, ud, uh = w * rng.uniform(0.45, 0.6), d * rng.uniform(0.5, 0.7), rng.uniform(2.0, 2.5)
        ux, uy = rng.choice([-1, 1]) * (w - uw) / 2, (d - ud) / 2
        assign(cube("UpperRoom", (uw, ud, uh), (ux, uy, h + uh / 2), bevel=0.06), mats["plaster"])
        assign(cube("UpperWindow", (0.3, 0.1, 0.45), (ux, uy - ud / 2 - 0.02, h + uh * 0.6)), mats["window"] if rng.random() < 0.6 else mats["dark"])
    if rng.random() < 0.55:                                             # outside stair to the roof
        sx = rng.choice([-1, 1])
        for i in range(int(h / 0.24)):
            assign(cube("Step", (0.7, 0.3, 0.24 * (i + 1)), (sx * (w / 2 + 0.36), -d / 2 + 0.2 + i * 0.3, 0.12 * (i + 1)), bevel=0.03), mats["plaster"])
    return new_objects(before)


# ---------------------------------------------------------------------------
# Animals
# ---------------------------------------------------------------------------

def sheep(mats, rng, lying=False, lamb=False):
    """An Awassi sheep, the old breed of the region: cream fleece, brown face and legs, drooping
    ears, a broad fat tail. Returns the root object it hangs from."""
    before = set(bpy.data.objects)
    z0 = 0.24 if lying else 0.6
    tex = bpy.data.textures.get("WoolLumps") or bpy.data.textures.new("WoolLumps", "CLOUDS")
    tex.noise_scale = 0.06
    tex.noise_depth = 2

    def woolly(name, radius, loc, scale, tilt=0.0):
        o = sphere(name, radius, loc, scale=scale, segments=48)
        o.rotation_euler = (0, deg(tilt), 0)
        lumps = o.modifiers.new("Wool", "DISPLACE")
        lumps.texture = tex
        lumps.strength = 0.045
        lumps.mid_level = 0.4
        assign(o, mats["wool"])
        return o

    woolly("Body", 1.0, (0, 0, z0), (0.4, 0.215, 0.225))
    woolly("Chest", 1.0, (0.22, 0, z0 + 0.02), (0.2, 0.19, 0.21))
    woolly("Rump", 1.0, (-0.24, 0, z0 + 0.01), (0.19, 0.2, 0.2))
    woolly("Neck", 1.0, (0.37, 0, z0 + 0.13), (0.11, 0.1, 0.17), tilt=-28)
    woolly("Tail", 1.0, (-0.42, 0, z0 - 0.07), (0.07, 0.085, 0.12))
    hx, hz = 0.5, z0 + 0.25
    head = sphere("Head", 1.0, (hx, 0, hz), scale=(0.135, 0.07, 0.078), segments=24)
    head.rotation_euler = (0, deg(24), 0)
    assign(head, mats["sheep_face"])
    for sy in (-1, 1):
        ear = sphere("Ear", 0.045, (hx - 0.07, sy * 0.082, hz + 0.0), scale=(0.75, 0.3, 1.45), segments=12)
        ear.rotation_euler = (deg(sy * 30), 0, 0)
        assign(ear, mats["sheep_face"])
        assign(sphere("SheepEye", 0.012, (hx + 0.035, sy * 0.058, hz + 0.02), segments=8), mats["dark"])
    if lying:
        for sy in (-1, 1):                                              # forelegs folded under the chest
            tube("Leg", [(0.2, sy * 0.1, 0.07), (0.36, sy * 0.11, 0.05), (0.3, sy * 0.13, 0.03)], 0.03, mats["sheep_face"], resolution=4)
    else:
        for x in (-0.25, 0.25):
            for sy in (-1, 1):
                tube("Leg", [(x, sy * 0.1, z0 - 0.1), (x + 0.012, sy * 0.1, 0.24), (x, sy * 0.1, 0.0)], 0.03, mats["sheep_face"], resolution=4)
    return group(new_objects(before), scale=0.6 if lamb else 1.0)


def with_children(root):
    return [root] + [o for o in bpy.data.objects if o.parent is not None and (o.parent is root or o.parent.parent is root)]


def watch_fire(mats, rng):
    before = set(bpy.data.objects)
    for i in range(9):
        a = 2 * math.pi * i / 9
        s = boulder(rng, mats["limestone"], rng.uniform(0.11, 0.17))
        s.location = (0.48 * math.cos(a), 0.48 * math.sin(a), 0.06)
    for i in range(5):
        a = rng.uniform(0, 3.14)
        tube("Log", [(-0.32 * math.cos(a), -0.32 * math.sin(a), 0.05), (0.32 * math.cos(a), 0.32 * math.sin(a), 0.16)], 0.045, mats["timber"], resolution=3)
    for i in range(6):
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=rng.uniform(0.06, 0.13), radius2=0.0, depth=rng.uniform(0.3, 0.62),
                                        location=(rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0.4))
        f = bpy.context.object
        f.name = "Flame"
        assign(f, mats["fire"])
        f.visible_shadow = False
    point_light("FireLight", (0, 0, 0.55), 900, (1.0, 0.45, 0.12), radius=0.25)
    return new_objects(before)


def depth_picture(scene, path):
    """A second, quick render in which brightness means distance (black = here, white = 420 m
    away). art/post.py uses it to lay night haze over the far hills, so they stand apart."""
    m = bpy.data.materials.new("DepthOnly")
    nt = m.node_tree
    nt.nodes.clear()
    cam = nt.nodes.new("ShaderNodeCameraData")
    rng_ = nt.nodes.new("ShaderNodeMapRange")
    rng_.inputs["From Min"].default_value = 16.0
    rng_.inputs["From Max"].default_value = 420.0
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(cam.outputs["View Distance"], rng_.inputs["Value"])
    nt.links.new(rng_.outputs["Result"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    bpy.context.view_layer.material_override = m
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    render(path)


def anchors(scene, cam):
    """Where the shelter lands in the picture, as fractions of its width and height.
    countdown.js hangs the Star of Bethlehem over it, so copy these into COUNTDOWN_LAND there."""
    from bpy_extras.object_utils import world_to_camera_view
    for label, p in [("roof", Vector((0, 0.9, ROOF + 0.75))), ("manger", Vector((0.1, 0.55, 0.75)))]:
        v = world_to_camera_view(scene, cam, p)
        print(f"[art] anchor {label} x={v.x:.4f} y={1 - v.y:.4f}")


# ---------------------------------------------------------------------------
# The scene
# ---------------------------------------------------------------------------

def land():
    reset()
    setup_render(res=1800, samples=320)
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y = 3200, 1800
    s.view_settings.look = "AgX - Medium High Contrast"
    s.view_settings.exposure = 0.35
    world(0.03, 0.05, 0.12, 0.2)                   # a clear night sky
    rng = random.Random(1)
    cast = figures.people()                        # first, while the scene is empty (cloth is draped on them)
    mats = materials()

    terrain(mats)
    near_ground(mats)
    rock_face(mats)

    # Starlight from high above and behind the shelter, and a faint cool fill from the front.
    sun("Starlight", (-0.28, -0.62, -0.73), 0.95, (0.62, 0.74, 1.0), angle=1.5)
    sun("SkyFill", (0.3, 0.8, -0.5), 0.1, (0.5, 0.62, 1.0), angle=40)

    # --- The shelter and everyone in it -------------------------------------
    shelter(mats, rng)
    group(manger(mats, rng), (0.1, 0.55, 0.0), yaw=4)
    places = {
        "Mary": ((-0.82, 0.78, 0.0), 58),          # kneeling at the child's head
        "Joseph": ((0.92, 1.28, 0.0), -26),        # standing behind, watching over them
        "Shepherd": ((-1.5, -0.42, 0.0), 124),     # on his knees, hands together
        "Youth": ((1.42, -0.5, 0.0), -128),        # the boy
        "Elder": ((2.0, 0.62, 0.0), -74),          # the old man on his staff
    }
    for name, (loc, yaw) in places.items():
        cast[name].location = loc
        cast[name].rotation_euler = (0, 0, deg(yaw))
    # Lamps: one on a stone by the manger, one on a ledge of the wall; and the gentle light
    # painters have always let fall from the child.
    stone = boulder(rng, mats["limestone"], 0.2)
    stone.location = (-0.85, -1.45, 0.08)
    oil_lamp(mats, (-0.85, -1.45, 0.19), 260)
    # The glow of the fold's own small fire, off to the left of the picture, on the near side.
    spot = bpy.data.lights.new("Embers", "SPOT")
    spot.energy, spot.color, spot.spot_size, spot.spot_blend, spot.shadow_soft_size = 2600, (1.0, 0.58, 0.26), deg(34), 0.7, 0.5
    ember = bpy.data.objects.new("Embers", spot)
    bpy.context.collection.objects.link(ember)
    ember.location = (-3.5, -9.5, 2.6)
    look_at(ember, (0.2, 0.3, 0.8))
    assign(cube("Ledge", (0.34, 0.4, 0.09), (2.3, 1.55, 1.36), bevel=0.03), mats["limestone"])
    oil_lamp(mats, (2.24, 1.55, 1.41), 170)
    oil_lamp(mats, (-2.2, 1.9, 1.02), 120)         # a third, set on the hay-side wall
    point_light("MangerLight", (0.05, 0.2, 1.2), 11, (1.0, 0.84, 0.62), radius=0.1)

    # Sheep come in with the shepherds: a lamb near the manger, two ewes at the edge.
    for kind, loc, yaw in ((dict(lamb=True), (0.55, -1.5, 0.0), 118),
                           (dict(), (-3.1, -0.9, 0.0), 12),
                           (dict(), (3.25, -1.25, 0.0), 158)):
        root = sheep(mats, rng, **kind)
        root.location = loc
        root.rotation_euler = (0, 0, deg(yaw))

    # --- The ground near at hand ---------------------------------------------
    rng = random.Random(2)
    stones = [into_collection([boulder(rng, mats["rock"], sz)], f"Stone{i}") for i, sz in enumerate((0.12, 0.2, 0.32, 0.5))]
    tuft_obj = sphere("Tuft", 0.16, (0, 0, -0.1), scale=(1, 1, 0.5), segments=8)
    assign(tuft_obj, mats["earth"])
    strands(tuft_obj, mats["dry_grass"], 260, 0.22, children=5, thickness=0.0028, random_dir=0.28)
    tuft = into_collection([tuft_obj], "Tuft")
    for i in range(5200):
        x, y = rng.uniform(-34, 16), rng.uniform(-17, 46) if i % 3 else rng.uniform(-17, 2)
        if math.hypot(x, y - 0.6) < 3.4:
            continue
        z = ground_height(x, y)
        roll = rng.random()
        if roll < 0.62:                                                 # pebbles and grit
            instance(stones[0], (x, y, z + 0.0), rng.uniform(0, 6.28), rng.uniform(0.12, 0.5))
        elif roll < 0.78:                                               # stones
            instance(rng.choice(stones[:3] if rng.random() < 0.95 else stones), (x, y, z - 0.03), rng.uniform(0, 6.28), rng.uniform(0.4, 1.1))
        else:
            instance(tuft, (x, y, z), rng.uniform(0, 6.28), rng.uniform(0.6, 1.5))

    # --- Trees ------------------------------------------------------------------
    rng = random.Random(3)
    olives = [into_collection(olive(rng, mats, size), f"Olive{i}") for i, size in enumerate((1.0, 1.25, 0.85))]
    cyp = into_collection(cypress(mats), "CypressTree")

    def sightline(x, y, tx, ty, width):
        dx, dy = tx - CAM.x, ty - CAM.y
        t = ((x - CAM.x) * dx + (y - CAM.y) * dy) / (dx * dx + dy * dy)
        return 0.0 < t < 1.0 and math.hypot(x - (CAM.x + t * dx), y - (CAM.y + t * dy)) < width

    for x, y, sc in ((-11.2, -1.5, 1.15), (-8.5, 9.0, 0.95), (5.6, 8.5, 1.0), (9.5, 6.0, 1.2)):
        instance(olives[int(abs(x)) % 3], (x, y, ground_height(x, y)), rng.uniform(0, 6.28), sc)
    placed = 0
    while placed < 95:
        x, y = rng.uniform(-120, 30), rng.uniform(16, 150)
        if sightline(x, y, FIRE.x, FIRE.y, 5) or math.hypot(x - FIRE.x, y - FIRE.y) < 7 or math.hypot(x - TOWN.x, y - TOWN.y) < 30:
            continue
        instance(rng.choice(olives), (x, y, ground_height(x, y)), rng.uniform(0, 6.28), rng.uniform(0.8, 1.4))
        placed += 1
    for i in range(11):
        a = rng.uniform(0, 6.28)
        x, y = TOWN.x + math.cos(a) * rng.uniform(14, 42), TOWN.y + math.sin(a) * rng.uniform(10, 30)
        instance(cyp, (x, y, ground_height(x, y) - 0.2), 0, rng.uniform(0.8, 1.3))

    # --- Bethlehem ---------------------------------------------------------------
    rng = random.Random(5)
    homes = [into_collection(house(mats, rng, w, d, h), f"House{i}")
             for i, (w, d, h) in enumerate(((6.5, 5.5, 3.4), (8.0, 6.0, 3.8), (5.0, 5.0, 3.0), (7.0, 7.5, 4.2), (9.5, 6.5, 3.6), (5.5, 4.5, 5.6)))]
    spots = []
    tries = 0
    while len(spots) < 44 and tries < 4000:
        tries += 1
        x, y = TOWN.x + rng.gauss(0, 24), TOWN.y + rng.gauss(0, 15)
        if all(math.hypot(x - px, y - py) > 8.5 for px, py in spots):
            spots.append((x, y))
    spots += [(-27.0, 66.0), (-36.0, 74.0), (-19.0, 82.0), (-58.0, 80.0)]          # a few houses below the village
    for k, (x, y) in enumerate(spots):
        instance(rng.choice(homes), (x, y, ground_height(x, y) - 0.25), deg(rng.uniform(-40, 40) + rng.choice([0, 0, 90])), rng.uniform(0.9, 1.1))
        if k % 4 == 0:                                                  # lamplight spilling into the lanes
            point_light("LaneLight", (x + 3.0, y - 4.5, ground_height(x, y) + 1.6), 340, (1.0, 0.55, 0.22), radius=0.3)

    # --- The shepherds' watch fire, out in the fields ------------------------------
    rng = random.Random(6)
    group(watch_fire(mats, rng), (FIRE.x, FIRE.y, FIRE_LEVEL))
    flock = [into_collection(with_children(sheep(mats, rng, lying=lying)), f"Flock{i}") for i, lying in enumerate((False, True))]
    for i in range(14):
        a, r = rng.uniform(0, 6.28), rng.uniform(2.2, 7.5)
        x, y = FIRE.x + r * math.cos(a), FIRE.y + r * math.sin(a)
        instance(flock[i % 2], (x, y, ground_height(x, y)), rng.uniform(0, 6.28), rng.uniform(0.9, 1.1))

    cam = camera(tuple(CAM), tuple(LOOK), lens=35)
    bpy.context.view_layer.update()
    anchors(s, cam)
    render(os.path.join(OUT, "countdown-land.png"))
    depth_picture(s, os.path.join(OUT, "countdown-depth.png"))


land()
