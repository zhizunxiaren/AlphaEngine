#pragma once

#include "rtweekend.h"
#include "hittable_list.h"
#include "material.h"

class camera{
    public:
    double aspect_ratio = 1.0;
    int image_width = 100;
    int sample_per_pixel = 10;
    int max_depth = 10;


    void render(hittable_list world){

        initialize();

        std::ofstream out("image.ppm", std::ios::binary);
        if(!out)
        {
            std::cerr << "Failed to open file" << std::endl;
            return;
        }

        // Render

        out << "P3\n" << image_width << ' ' << image_height << "\n255\n";

        for (int j = 0; j < image_height; j++) {
            std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
            for (int i = 0; i < image_width; i++) {
                color pixel_color(0,0,0);
                for(int k = 0; k < sample_per_pixel; k++)
                {
                    ray ray_temp = get_ray(i, j );
                    pixel_color += ray_color(ray_temp, max_depth, world);
                }

                write_color(out, pixel_color * pixel_sample_scale);
            }
        }

        std::clog << "\rDone.                 \n";
    }

    private:
        int    image_height;   // Rendered image height
        double pixel_sample_scale; // Color scale factor for a sum of pixel samples
        point3 center;         // Camera center
        point3 pixel00_loc;    // Location of pixel 0, 0
        vec3   pixel_delta_u;  // Offset to pixel to the right
        vec3   pixel_delta_v;  // Offset to pixel below

        void initialize(){
            // Calculate the image height, and ensure that it's at least 1.
            image_height = int(image_width / aspect_ratio);
            image_height = (image_height < 1) ? 1 : image_height;

            pixel_sample_scale = 1.0 / sample_per_pixel;

            // camera
            auto focal_length = 1.0;
            auto viewport_height = 2.0;
            auto viewport_width = viewport_height * (double(image_width) / image_height);// 计算实际的viewport_width
            center = point3(0,0,0);

            // Calculate the vectors across the horizontal and down the vertical viewport edges.计算沿视口水平边缘和垂直向下边缘的向量。
            auto viewport_u = vec3(viewport_width, 0, 0);
            auto viewport_v = vec3(0, -viewport_height, 0);

            // Calculate the horizontal and vertical delta vectors from pixel to pixel.
            pixel_delta_u = viewport_u / image_width;
            pixel_delta_v = viewport_v / image_height;

            // Calculate the location of the upper left pixel.
            auto viewport_upper_left = center - vec3(0, 0, focal_length) - viewport_u / 2 - viewport_v / 2;
            pixel00_loc = viewport_upper_left + 0.5 * (pixel_delta_u + pixel_delta_v); // 从视口左上角角点，向右下移半个像素步长。
        }


        ray get_ray(int i, int j ) const {
            // Construct a camera ray originating from the origin and directed at randomly sampled
            // point around the pixel location i, j.
            vec3 offset = sample_square();
            point3 pixel_sampe = pixel00_loc + (i + offset.x()) * pixel_delta_u + (j + offset.y()) * pixel_delta_v;
            point3 ray_origin = center;
            vec3 ray_direction = pixel_sampe - ray_origin;
            return ray(ray_origin, ray_direction);

        }

        vec3 sample_square() const {
            // Returns the vector to a random point in the [-.5,-.5]-[+.5,+.5] unit square.
            return vec3(random_double() - 0.5, random_double() - 0.5, 0);
        }

        color ray_color(const ray& r, int depth, const hittable& world){
            // If we've exceeded the ray bounce limit, no more light is gathered.
            if(depth <= 0)
            {
                return color(0,0,0);
            }

            hit_record rec;
            if (world.hit(r, interval(0.001, infinity), rec)) {
                // rec.normal 法向量
                // random_unit_vector 随机一个向量
                // rec.normal + random_unit_vector() 一个散射方向---- 这个很重要
                //vec3 direction = rec.normal + random_unit_vector();
                //return 0.5 * ray_color(ray(rec.p, direction), depth - 1, world);
                ray scattered;
                color attenuation;
                if(rec.mat->scatter(r, rec, attenuation, scattered))
                {
                    return attenuation  * ray_color(scattered, depth - 1, world);
                }
                return color(0,0,0);
            }

            vec3 unit_direction = unit_vector(r.direction());
            auto a = 0.5 * (unit_direction.y() + 1.0);
            return (1.0 -a) * color(1.0, 1.0, 1.0) + a * color(0.5, 0.7, 1.0);
        }


};