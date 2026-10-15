#pragma once

#include "hittable.h"


class quad : public hittable
{
public:
    quad(const point3& Q, const vec3&u, const vec3&v, shared_ptr<material> mat)
        : Q(Q), u(u), v(v), mat(mat)
    {
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

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override
    {
        return false;
    }

private:
    point3 Q;
    vec3 u;
    vec3 v;
    shared_ptr<material> mat;
    aabb bbox;
};
