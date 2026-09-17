#pragma once

#include "color.h"
#include "ray.h"
#include "hittable.h"

class material{
    public:
        ~material(){}

        virtual bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered) const{
            return false;
        }
};

class lambertian : public material{
    public:

        lambertian(const color& albedo) : albedo(albedo) {}

        bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered) const override{
            
            vec3 scatter_direction = rec.normal + random_unit_vector();
            // Catch degenerate scatter direction
            if(scatter_direction.near_zero())
            {
                scatter_direction = rec.normal;
            }
            scattered = ray(rec.p, scatter_direction);
            attenuation = albedo;

            return true;
        }

    private:
        color albedo;
};

class metal : public material{
    public:
        
        metal(const color& albedo, double fluzz) : albedo(albedo), fluzz(fluzz < 1 ? fluzz : 1){}

        bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered) const override{
            vec3 reflected = reflection(r_in.direction(), rec.normal);
            reflected = unit_vector(reflected) + fluzz * random_unit_vector();
            scattered = ray(rec.p, reflected);
            attenuation = albedo;

            return true;
        }

    private:
        color albedo;
        double fluzz;
};