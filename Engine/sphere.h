#pragma once

#include "hittable.h"
#include "vec3.h"

class sphere : public hittable{
    
    public:
        sphere(const point3& center, double radius, shared_ptr<material> mat) : center(center), 
            radius(std::fmax(0,radius)), mat(mat){
        };

        bool hit(const ray& r, interval ray_t, hit_record& hitrecord) const override{
            vec3 oc = center - r.origin();
            auto a = r.direction().length_squared();
            auto h = dot(r.direction(), oc);
            auto c = oc.length_squared() - radius*radius;
            auto discriminant = h*h - a*c;
            if (discriminant < 0)
            {
                return false;
            }

            double sqrt_temp = std::sqrt(discriminant);
            // Find the nearest root that lies in the acceptable range.
            auto root = (h - sqrt_temp) / a;
            if(!ray_t.surrounds(root))
            {
                root = (h + sqrt_temp) / a;
                if(!ray_t.surrounds(root))
                {
                    return false;
                }
            }

            hitrecord.t = root;
            hitrecord.p = r.at(hitrecord.t);
            vec3 outward_normal = (hitrecord.p - center) / radius;
            hitrecord.set_face_normal(r, outward_normal);
            hitrecord.mat = mat;

            return true;
        }


    private:
        point3 center;
        double radius;
        shared_ptr<material> mat;
};