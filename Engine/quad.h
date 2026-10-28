#pragma once

#include "hittable.h"


class quad : public hittable
{
public:
    // Q 是平行四边形的一个角点，u/v 是由它出发的两条完整边长。
    // 注意 ellipse / annulus 把 Q 当作中心（见各自说明），两者语义不同。
    quad(const point3& Q, const vec3&u, const vec3&v, shared_ptr<material> mat)
        : Q(Q), u(u), v(v), mat(mat)
    {
        auto n = cross(u, v);
        assert(!n.near_zero() && "quad: u and v must not be parallel (degenerate plane)");
        normal = unit_vector(n);
        D = dot(normal, Q);
        w = n / dot(n, n);
        
        set_bounding_box();
    }

    virtual void set_bounding_box()
    {
        auto bbox_diagonal1 = aabb(Q, Q + u + v);
        auto bbox_diagonal2 = aabb(Q + u, Q + v);

        bbox = aabb(bbox_diagonal1, bbox_diagonal2);
    }

    aabb bounding_box() const override
    {
        return bbox;
    }
    
    virtual bool hit_ab(double a, double b, hit_record& rec) const {
        // Given the hit point in plane coordinates, return false if it is outside the
        // primitive, otherwise set the hit record UV coordinates and return true.

        if ((a < 0) || (1 < a) || (b < 0) || (1 < b))
            return false;

        rec.u = a;
        rec.v = b;
        return true;
    }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override
    {
        auto denom = dot(normal, r.direction());
        
        // 如果射线与平面平行，则不会击中目标。
        if (std::fabs(denom) < 1e-8)
        {
            return false;
        }
        
        // Return false if the hit point parameter t is outside the ray interval.
        auto t = (D - dot(normal, r.origin())) / denom;
        if (!ray_t.contains(t))
        {
            return false;
        }
        
        // 使用平面坐标确定命中点是否位于平面形状内。
        auto intersection = r.at(t);
        vec3 planar_hitpt_vector = intersection -Q;
        auto alpha = dot(w, cross(planar_hitpt_vector, v));
        auto beta = dot(w, cross(u, planar_hitpt_vector));
        if (!hit_ab(alpha, beta, rec))
        {
            return false;
        }
        rec.t = t;
        rec.p = intersection;
        rec.mat = mat;
        rec.set_face_normal(r, normal);
  
        return true;
    }
    
protected:
    point3 Q;
    vec3 u;
    vec3 v;
    vec3 w;
    shared_ptr<material> mat;
    aabb bbox;
    vec3 normal;
    double D;
};

class tri : public quad {
public:
    tri(const point3& o, const vec3& aa, const vec3& ab, shared_ptr<material> m)
      : quad(o, aa, ab, m)
    {}

    virtual bool hit_ab(double a, double b, hit_record& rec) const override {
        if ((a < 0) || (b < 0) || (a + b > 1))
            return false;

        rec.u = a;
        rec.v = b;
        return true;
    }
};

class ellipse : public quad {
public:
    ellipse(
        const point3& center, const vec3& side_A, const vec3& side_B, shared_ptr<material> m
    ) : quad(center, side_A, side_B, m)
    {
        set_bounding_box();
    }

    virtual void set_bounding_box() override {
        bbox = aabb(Q - u - v, Q + u + v);
    }

    virtual bool hit_ab(double a, double b, hit_record& rec) const override {
        if ((a*a + b*b) > 1)
            return false;

        rec.u = a/2 + 0.5;
        rec.v = b/2 + 0.5;
        return true;
    }
};

class annulus : public quad {
public:
    annulus(
        const point3& center, const vec3& side_A, const vec3& side_B, double _inner,
        shared_ptr<material> m)
      : quad(center, side_A, side_B, m), inner(_inner)
    {
        assert((_inner > 0.0) && (_inner < 1.0) && "annulus: inner radius must lie in (0, 1)");
        set_bounding_box();
    }

    virtual void set_bounding_box() override {
        bbox = aabb(Q - u - v, Q + u + v);
    }

    virtual bool hit_ab(double a, double b, hit_record& rec) const override {
        auto center_dist = sqrt(a*a + b*b);
        if ((center_dist < inner) || (center_dist > 1))
            return false;

        rec.u = a/2 + 0.5;
        rec.v = b/2 + 0.5;
        return true;
    }

private:
    double inner;
};