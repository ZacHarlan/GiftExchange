"""Shared helpers for the Blender scene scripts in art/.

Every scene script does:  from common import *
and is run headless by art/render.sh:
    Blender -b --factory-startup -P art/<scene>.py -- <out_dir>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ART_DIR = os.path.dirname(os.path.abspath(__file__))


def out_dir():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    d = argv[0] if argv else os.path.join(ART_DIR, "build")
    os.makedirs(d, exist_ok=True)
    return d


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.curves):
        for block in list(coll):
            coll.remove(block)


def setup_render(res=640, samples=128):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    s.cycles.device = "GPU"
    # ART_SAMPLES / ART_SCALE let you iterate quickly: ART_SAMPLES=32 ART_SCALE=50 bash art/render.sh hero
    s.cycles.samples = int(os.environ.get("ART_SAMPLES", samples))
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 12
    s.cycles.glossy_bounces = 6
    s.cycles.transmission_bounces = 8
    s.render.film_transparent = True
    s.render.resolution_x = res
    s.render.resolution_y = res
    s.render.resolution_percentage = int(os.environ.get("ART_SCALE", 100))
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.render.image_settings.color_depth = "8"
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Punchy"
    world(0.025, 0.035, 0.07, 1.0)


def world(r, g, b, strength):
    w = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    nt = w.node_tree
    bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (r, g, b, 1)
    bg.inputs["Strength"].default_value = strength


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def camera(loc, target, lens=70):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, target)
    bpy.context.scene.camera = cam
    return cam


def area_light(name, loc, target, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    look_at(obj, target)
    return obj


def point_light(name, loc, energy, color=(1, 0.7, 0.35), radius=0.05):
    data = bpy.data.lights.new(name, "POINT")
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return obj


def studio(target=(0, 0, 0.5), scale=1.0):
    """Warm key, cool fill, strong rim — reads well on a dark navy page."""
    t = target
    area_light("Key", (4 * scale, -4 * scale, 5 * scale), t, 900 * scale ** 2, 3 * scale, (1.0, 0.93, 0.85))
    area_light("Fill", (-5 * scale, -2.5 * scale, 2.5 * scale), t, 250 * scale ** 2, 4 * scale, (0.75, 0.82, 1.0))
    area_light("Rim", (-1.5 * scale, 5 * scale, 4 * scale), t, 700 * scale ** 2, 2 * scale, (1.0, 0.85, 0.7))
    area_light("Top", (0, 0, 7 * scale), t, 200 * scale ** 2, 5 * scale)


def shadow_catcher(size=20, z=0.0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    plane = bpy.context.object
    plane.name = "ShadowCatcher"
    plane.is_shadow_catcher = True
    return plane


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def principled(name, color, metallic=0.0, roughness=0.5, coat=0.0, coat_rough=0.05,
               sheen=0.0, emission=None, emission_strength=0.0, transmission=0.0, ior=1.45,
               specular=0.5, anisotropic=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Specular IOR Level"].default_value = specular
    b.inputs["Anisotropic"].default_value = anisotropic
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = ior
    if emission is not None:
        b.inputs["Emission Color"].default_value = (*emission, 1)
        b.inputs["Emission Strength"].default_value = emission_strength
    return m


def bsdf(m):
    return m.node_tree.nodes["Principled BSDF"]


def add_bump(m, scale=8.0, strength=0.15, detail=6.0, distortion=0.0, coord="Object"):
    """Procedural noise bump — crinkled foil, crispy edges, cast iron grain."""
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Distortion"].default_value = distortion
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(tc.outputs[coord], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf(m).inputs["Normal"])
    return noise


def gold(name="Gold", roughness=0.22, tint=(1.0, 0.72, 0.28)):
    return principled(name, tint, metallic=1.0, roughness=roughness)


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj, bevel=0.0, segments=4, subsurf=0):
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    if subsurf:
        mod = obj.modifiers.new("Subsurf", "SUBSURF")
        mod.levels = subsurf
        mod.render_levels = subsurf
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def cube(name, size, loc, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return smooth(o, bevel=bevel)


def cylinder(name, radius, depth, loc, verts=64, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, vertices=verts)
    o = bpy.context.object
    o.name = name
    return smooth(o, bevel=bevel)


def curve_tube(name, points, bevel_depth, resolution=24, closed=False):
    """A round tube following a poly-bezier through `points` (auto handles)."""
    cd = bpy.data.curves.new(name, "CURVE")
    cd.dimensions = "3D"
    cd.bevel_depth = bevel_depth
    cd.bevel_resolution = 8
    cd.resolution_u = resolution
    cd.use_fill_caps = True
    spline = cd.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    spline.use_cyclic_u = closed
    o = bpy.data.objects.new(name, cd)
    bpy.context.collection.objects.link(o)
    return o


def spline_points(points, per_segment=16, closed=False):
    """Catmull-Rom curve through `points` -> dense list of Vectors."""
    P = [Vector(p) for p in points]
    if closed:
        ext = [P[-1]] + P + [P[0], P[1]]
        segs = len(P)
    else:
        ext = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
        segs = len(P) - 1
    out = []
    for i in range(segs):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        for k in range(per_segment):
            t = k / per_segment
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(ext[-2] if not closed else P[0].copy())
    return out


class _Polyline:
    """Arc-length parametrised polyline: pos(s), tangent(s)."""

    def __init__(self, pts):
        self.pts = pts
        self.cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            self.cum.append(self.cum[-1] + (b - a).length)
        self.length = self.cum[-1]

    def _seg(self, s):
        s = max(0.0, min(self.length, s))
        lo, hi = 0, len(self.cum) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        seg = self.cum[hi] - self.cum[lo]
        return lo, hi, (s - self.cum[lo]) / seg if seg else 0.0

    def pos(self, s):
        lo, hi, f = self._seg(s)
        return self.pts[lo].lerp(self.pts[hi], f)

    def tangent(self, s):
        d = max(self.length / 400, 1e-4)
        return (self.pos(s + d) - self.pos(s - d)).normalized()


def ribbon_strip(name, points, width, width_hint, scale_fn=None, cup_fn=None, notch=0.0,
                 thickness=0.012, rows=120, cols=9, closed=False):
    """A flat ribbon (satin/paper strip) swept along a smooth curve through `points`.

    width_hint(t, pos, tangent) -> Vector: which way the ribbon's width points (orthogonalised
    against the tangent); scale_fn(t) narrows the ribbon (gathered ends); cup_fn(t) bows the
    cross-section; notch > 0 cuts a V into the far end (classic ribbon tail).
    """
    import bmesh
    line = _Polyline(spline_points(points, 24, closed))
    L = line.length
    bm = bmesh.new()
    grid = []
    for c in range(cols):
        u = -1 + 2 * c / (cols - 1)
        Lu = L - notch * (1 - abs(u))
        col = []
        for r in range(rows + 1):
            s = Lu * r / rows
            t = s / L
            p, T = line.pos(s), line.tangent(s)
            W = Vector(width_hint(t, p, T))
            W = (W - W.dot(T) * T).normalized()
            N = T.cross(W)
            sc = scale_fn(t) if scale_fn else 1.0
            cup = cup_fn(t) if cup_fn else 0.0
            v = p + W * (u * width / 2 * sc) + N * (cup * width * sc * (u * u - 0.35))
            col.append(bm.verts.new(v))
        grid.append(col)
    for c in range(cols - 1):
        for r in range(rows):
            bm.faces.new((grid[c][r], grid[c][r + 1], grid[c + 1][r + 1], grid[c + 1][r]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if thickness:
        sol = o.modifiers.new("Thick", "SOLIDIFY")
        sol.thickness = thickness
        sol.offset = 0
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[art] wrote {path}")


def deg(x):
    return math.radians(x)
