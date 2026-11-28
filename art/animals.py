"""Animals for the Nativity in countdown.py: Awassi sheep, the old fat-tailed breed of the region.

Each sheep is modelled as a body (blended volumes for barrel, chest, rump, neck, the muscle at the
top of each leg, and the broad tail), a separate head with a long convex nose and drooping ears,
slim lower legs with hooves, and a real fleece: tens of thousands of fine, crimped fibres growing
from the body, clumped into locks. Face and legs are brown and short-haired, as on the breed.

Run on its own for a close look in plain light:
    Blender -b --factory-startup -P art/animals.py -- art/build
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403


def blended(name, parts, resolution=0.022):
    """A smooth organic form from overlapping ellipsoids: (centre, radii) pairs that melt together."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = 0.6
    for centre, radii in parts:
        el = mb.elements.new(type="ELLIPSOID")
        el.co = centre
        el.radius = 2.0
        el.size_x, el.size_y, el.size_z = (r / 2.0 * 1.28 for r in radii)
        el.stiffness = 2.0
    o = bpy.data.objects.new(name, mb)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    o.name = name
    sm = o.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.8
    sm.iterations = 8
    for p in o.data.polygons:
        p.use_smooth = True
    xs = [v.co.x for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    print(f"[art] {name}: {len(o.data.vertices)} verts, x {min(xs):.2f}..{max(xs):.2f}, z {min(zs):.2f}..{max(zs):.2f}")
    return o


def fleece_material():
    """Raw wool: cream, a little yellowed and dusty, each fibre slightly different."""
    m = bpy.data.materials.get("Fleece") or principled("Fleece", (0.62, 0.56, 0.45), roughness=0.85, sheen=0.6)
    if m.get("built"):
        return m
    nt = m.node_tree
    info = nt.nodes.new("ShaderNodeHairInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.33, 0.27, 0.19, 1)       # deep in the lock, and dirty
    ramp.color_ramp.elements[1].color = (0.76, 0.7, 0.58, 1)        # the weathered tips
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    mix.inputs[1].default_value = 0.3
    nt.links.new(info.outputs["Random"], mix.inputs[0])
    nt.links.new(info.outputs["Intercept"], mix.inputs[2])
    nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Base Color"])
    m["built"] = True
    return m


def hide_material(name, color):
    """Short-haired hide (face, ears, legs)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = principled(name, color, roughness=0.7, sheen=0.5)
    add_bump(m, scale=260.0, strength=0.25, detail=3.0)
    return m


def grow(obj, mat, count, length, children, thickness, crimp=0.0, clump=0.0, seed=1, spread=0.25):
    """Fibres of a set length growing straight out of every face of `obj`; crimp, clumping and
    a little roughness then give them the disorder of real wool or hair."""
    if os.environ.get("ART_NOFUR"):
        return
    if mat.name not in [s.name for s in obj.material_slots]:
        obj.data.materials.append(mat)
    obj.modifiers.new("Fibres", "PARTICLE_SYSTEM")
    ps = obj.particle_systems[-1]
    ps.seed = seed
    pt = ps.settings
    pt.type = "HAIR"
    pt.count = count
    pt.hair_length = length
    pt.hair_step = 5
    pt.emit_from = "FACE"
    pt.use_advanced_hair = False              # in this mode hair_length is the true length
    pt.distribution = "RAND"
    pt.child_type = "INTERPOLATED"
    pt.rendered_child_count = children
    pt.child_length = 1.0
    pt.clump_factor = clump
    pt.clump_shape = 0.2
    pt.roughness_1 = length * 0.25 * spread
    pt.roughness_1_size = 0.3
    pt.roughness_2 = length * 0.12
    pt.roughness_endpoint = length * 0.15 * spread
    if crimp:
        pt.kink = "CURL"
        pt.kink_amplitude = crimp
        pt.kink_frequency = 7.0
    pt.root_radius = 1.0
    pt.tip_radius = 0.45
    pt.radius_scale = thickness
    pt.material_slot = mat.name
    obj.show_instancer_for_render = True


def sheep(rng, lying=False, lamb=False):
    """One Awassi sheep standing (or lying, legs folded under it), facing +x. Returns its root.
    A lamb is small, leggy and short in the fleece."""
    before = set(bpy.data.objects)
    wool, face, hoof = fleece_material(), hide_material("SheepHide", (0.1, 0.055, 0.03)), hide_material("Hoof", (0.02, 0.016, 0.012))
    eye = bpy.data.materials.get("SheepEyeDark") or principled("SheepEyeDark", (0.01, 0.008, 0.006), roughness=0.05, coat=1.0)
    leg = 0.3 if not lamb else 0.37                 # lambs are all leg
    z = 0.26 if lying else leg + 0.27               # height of the spine's centre line
    k = 0.86 if lamb else 1.0                       # a lamb's barrel is slimmer

    body = blended("SheepBody", [
        ((0.0, 0, z), (0.36, 0.2 * k, 0.21 * k)),                   # barrel
        ((0.0, 0, z - 0.07), (0.3, 0.18 * k, 0.16 * k)),            # belly
        ((0.27, 0, z - 0.01), (0.19, 0.175 * k, 0.21 * k)),         # chest
        ((0.33, 0, z + 0.06), (0.13, 0.13 * k, 0.15 * k)),          # shoulders / withers
        ((-0.29, 0, z + 0.01), (0.2, 0.19 * k, 0.2 * k)),           # rump
        ((0.39, 0, z + 0.1), (0.14, 0.125, 0.15)),                  # base of the neck: deep and thick
        ((0.44, 0, z + 0.19), (0.11, 0.1, 0.11)),                   # neck
        ((-0.47, 0, z - 0.06), (0.06, 0.075, 0.13)),                # the fat tail
    ] + ([] if lying else [
        ((0.28, sy * 0.105, z - 0.17), (0.07, 0.055, 0.13)) for sy in (-1, 1)        # forearm muscle
    ] + [
        ((-0.3, sy * 0.115, z - 0.15), (0.095, 0.06, 0.16)) for sy in (-1, 1)        # thigh
    ]))
    assign(body, wool)
    grow(body, wool, 5200 if not lamb else 3800, 0.05 if not lamb else 0.028, 46, 0.0016, crimp=0.0035, clump=0.55,
         seed=rng.randrange(999), spread=0.3)

    # Head: long and narrow, with the convex "Roman" nose of the breed, carried a little low.
    hx, hz = 0.52, z + 0.25
    head = blended("SheepHead", [
        ((hx, 0, hz), (0.078, 0.064, 0.07)),                        # skull
        ((hx + 0.075, 0, hz - 0.03), (0.075, 0.05, 0.058)),         # bridge of the nose
        ((hx + 0.145, 0, hz - 0.075), (0.055, 0.04, 0.045)),        # muzzle
        ((hx + 0.18, 0, hz - 0.1), (0.032, 0.033, 0.03)),           # nose and lips
        ((hx - 0.03, 0, hz - 0.04), (0.07, 0.055, 0.07)),           # jaw into the neck
    ], resolution=0.011)
    assign(head, face)
    grow(head, face, 2600, 0.007, 22, 0.0012, seed=rng.randrange(999), spread=0.4)
    for sy in (-1, 1):
        # Ears: long, leaf-shaped, hanging down and out.
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=(hx - 0.045, sy * 0.085, hz - 0.035), segments=20, ring_count=10)
        ear = bpy.context.object
        ear.name = "Ear"
        ear.scale = (0.034, 0.011, 0.085)
        ear.rotation_euler = (deg(sy * -38), deg(18), 0)
        for p in ear.data.polygons:
            p.use_smooth = True
        assign(ear, face)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0115, location=(hx + 0.055, sy * 0.049, hz - 0.002), segments=12, ring_count=8)
        bpy.context.object.name = "SheepEye"
        assign(bpy.context.object, eye)

    def lower_leg(points):
        cd = bpy.data.curves.new("Leg", "CURVE")
        cd.dimensions = "3D"
        cd.bevel_depth = 0.021
        cd.bevel_resolution = 5
        cd.use_fill_caps = True
        sp = cd.splines.new("BEZIER")
        sp.bezier_points.add(len(points) - 1)
        for bp, (p, r) in zip(sp.bezier_points, points):
            bp.co = p
            bp.radius = r
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        o = bpy.data.objects.new("Leg", cd)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(face)
        return o

    if lying:
        for sy in (-1, 1):                                          # forelegs folded back under the chest
            lower_leg([((0.28, sy * 0.1, 0.08), 1.1), ((0.4, sy * 0.1, 0.04), 0.95), ((0.33, sy * 0.115, 0.03), 0.9)])
    else:
        for x, bend in ((0.28, 0.012), (-0.31, -0.03)):
            for sy in (-1, 1):
                lower_leg([((x, sy * 0.105, z - 0.2), 1.5), ((x + bend, sy * 0.105, leg * 0.55), 1.15),      # knee / hock
                           ((x + bend * 0.2, sy * 0.105, leg * 0.2), 0.95), ((x + 0.006, sy * 0.105, 0.035), 1.05)])
                bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.027, radius2=0.022, depth=0.045, location=(x + 0.012, sy * 0.105, 0.02))
                bpy.context.object.name = "Hoof"
                assign(bpy.context.object, hoof)

    root = bpy.data.objects.new("Sheep", None)
    bpy.context.collection.objects.link(root)
    for o in [o for o in bpy.data.objects if o not in before and o is not root]:
        if o.parent is None:
            o.parent = root
    size = 0.56 if lamb else 1.0
    root.scale = (size, size, size)
    return root


if __name__ == "__main__":
    reset()
    setup_render(res=900, samples=int(os.environ.get("ART_SAMPLES", 96)))
    bpy.context.scene.render.resolution_x = 2200
    rng = random.Random(4)
    for i, (kind, yaw) in enumerate(((dict(), 20), (dict(lying=True), -25), (dict(lamb=True), 150), (dict(), -70))):
        r = sheep(rng, **kind)
        r.location = ((i - 1.5) * 1.35, 0, 0)
        r.rotation_euler = (0, 0, deg(yaw))
    shadow_catcher(size=20)
    world(0.25, 0.27, 0.3, 1.0)
    area_light("Key", (3, -5, 4), (0, 0, 0.5), 1400, 5, (1, 0.95, 0.9))
    area_light("Fill", (-4, -4, 2), (0, 0, 0.5), 500, 5, (0.85, 0.9, 1))
    camera((0, -6.6, 1.0), (0, 0, 0.45), lens=50)
    render(os.path.join(out_dir(), "animals-test.png"))
