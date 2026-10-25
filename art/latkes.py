"""Cast-iron skillet of golden latkes with a dollop of sour cream -> latkes.png"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F403

OUT = out_dir()
random.seed(7)


def cast_iron():
    m = principled("CastIron", (0.09, 0.085, 0.08), metallic=0.85, roughness=0.42)
    add_bump(m, scale=40, strength=0.25, detail=10)
    return m


def latke_material():
    """Golden-brown with darker crispy shreds."""
    m = principled("Latke", (0.6, 0.27, 0.03), roughness=0.6, coat=0.12, coat_rough=0.3, sheen=0.3)
    nt = m.node_tree
    b = bsdf(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6
    noise.inputs["Detail"].default_value = 8
    noise.inputs["Distortion"].default_value = 0.4
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.20, 0.065, 0.008, 1)
    ramp.color_ramp.elements[0].position = 0.36
    ramp.color_ramp.elements[1].color = (0.80, 0.45, 0.07, 1)
    ramp.color_ramp.elements[1].position = 0.72
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    # Shredded-potato texture: stretched wave bump.
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 26
    wave.inputs["Distortion"].default_value = 14
    wave.inputs["Detail"].default_value = 4
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.9
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def latke(loc, r, rot):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=0.12, location=loc, vertices=48)
    o = bpy.context.object
    o.rotation_euler = rot
    # Irregular, puffy edges.
    bev = o.modifiers.new("Round", "BEVEL")
    bev.width = 0.04
    bev.segments = 4
    sub = o.modifiers.new("Sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    tex = bpy.data.textures.new("LatkeDisp", "CLOUDS")
    tex.noise_scale = 0.18
    disp = o.modifiers.new("Lumpy", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.09
    disp.texture_coords = "OBJECT"
    for p in o.data.polygons:
        p.use_smooth = True
    return o


reset()
setup_render(res=720, samples=160)

# Skillet: lathe profile -> screw modifier.
prof = [(0.0, 0.0), (1.15, 0.0), (1.22, 0.04), (1.30, 0.30), (1.25, 0.31), (1.17, 0.07), (0.0, 0.07)]
mesh = bpy.data.meshes.new("Pan")
mesh.from_pydata([(x, 0, z) for x, z in prof], [(i, i + 1) for i in range(len(prof) - 1)], [])
pan = bpy.data.objects.new("Pan", mesh)
bpy.context.collection.objects.link(pan)
scr = pan.modifiers.new("Lathe", "SCREW")
scr.steps = scr.render_steps = 96
scr.use_merge_vertices = True
sub = pan.modifiers.new("Sub", "SUBSURF")
sub.levels = sub.render_levels = 1
for p in mesh.polygons:
    p.use_smooth = True
iron = cast_iron()
pan.data.materials.append(iron)
mod = pan.modifiers.new("Smooth", "WEIGHTED_NORMAL")

handle = cube("Handle", (1.2, 0.2, 0.09), (1.62, 0, 0.33), bevel=0.06)
handle.rotation_euler = (0, deg(-10), 0)
assign(handle, iron)
# Swing the handle round to the back-right so it stays in frame.
pivot = bpy.data.objects.new("HandlePivot", None)
bpy.context.collection.objects.link(pivot)
for o in (handle,):
    o.parent = pivot
pivot.rotation_euler = (0, 0, deg(62))

# Oil sheen pooled in the pan.
oil = cylinder("Oil", 1.16, 0.004, (0, 0, 0.074))
assign(oil, principled("Oil", (0.6, 0.4, 0.05), roughness=0.05, transmission=0.9, ior=1.47, coat=1.0))

lm = latke_material()
spots = [((-0.45, -0.3, 0.14), 0.46), ((0.44, -0.25, 0.14), 0.44), ((0.0, 0.44, 0.14), 0.45),
         ((0.05, -0.05, 0.25), 0.40)]
for loc, r in spots:
    o = latke(loc, r, (deg(random.uniform(-6, 6)), deg(random.uniform(-6, 6)), deg(random.uniform(0, 90))))
    assign(o, lm)

# Sour cream dollop on the top latke.
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, location=(0.05, -0.05, 0.36), segments=48, ring_count=24)
cream = bpy.context.object
cream.scale = (1, 1, 0.62)
tex = bpy.data.textures.new("CreamSwirl", "CLOUDS")
tex.noise_scale = 0.08
d = cream.modifiers.new("Swirl", "DISPLACE")
d.texture = tex
d.strength = 0.03
smooth(cream, subsurf=1)
cm = principled("SourCream", (0.95, 0.94, 0.88), roughness=0.3, coat=0.5)
b = bsdf(cm)
b.inputs["Subsurface Weight"].default_value = 0.4
b.inputs["Subsurface Radius"].default_value = (0.3, 0.25, 0.2)
assign(cream, cm)
# Chive flecks.
chive = principled("Chive", (0.08, 0.35, 0.05), roughness=0.5)
for i in range(7):
    a = random.uniform(0, 6.28)
    rr = random.uniform(0.02, 0.1)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.07,
                                        location=(0.05 + rr * math.cos(a), -0.05 + rr * math.sin(a), 0.435))
    c = bpy.context.object
    c.rotation_euler = (deg(90), 0, a)
    assign(c, chive)

shadow_catcher()
studio(target=(0, 0, 0.15), scale=1.0)
camera((2.6, -3.6, 3.3), (0.35, 0.35, 0.05), lens=46)
render(os.path.join(OUT, "latkes.png"))
