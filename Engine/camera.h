#pragma once

#include <algorithm>
#include <chrono>

#include "rtweekend.h"
#include "hittable_list.h"
#include "material.h"

class camera{
    public:
    double aspect_ratio = 1.0;
    int image_width = 100;
    int sample_per_pixel = 10;
    int max_depth = 10;

    double vfov = 90;
    point3 lookfrom = point3(0,0,0);
    point3 lookat = point3(0,0, -1);
    vec3 vup = vec3(0,1,0);
    
    double defocus_angle = 0; // Variation angle of rays through each pixel
    double focus_dist = 10; // Distance from camera lookfrom point to plane of perfect focus
    
    void render(const hittable_list& world){

        using clock_type = std::chrono::steady_clock;   // 单调时钟，不受系统时间调整影响
        const auto t_start = clock_type::now();
        
        initialize();
        
        std::vector<color> framebuffer(
            static_cast<std::size_t>(image_width) * image_height);
        
        unsigned thread_count = std::min(std::max(1u, std::thread::hardware_concurrency()), static_cast<unsigned>(image_height));

        constexpr std::uint32_t BASE_SEED = 5489;
        
        // 行级动态调度：各行计算量差异大（打到玻璃球的像素递归更深），
        // 动态取行比静态分块更能自动负载均衡。
        int rows_per_thread = (image_height + static_cast<int>(thread_count) - 1)
                            / static_cast<int>(thread_count);

        auto worker = [&] (std::uint32_t seed, int row_begin, int row_end)
        {
            rng_t rng(seed);
            for (int j = row_begin; j < row_end; j++)
            {
                for (int i = 0 ; i < image_width; i++)
                {
                    color pixel_color(0, 0, 0);
                    for (int k = 0; k < sample_per_pixel; k++)
                    {
                        ray r = get_ray(i, j, rng);
                        pixel_color += ray_color(r, max_depth, world, rng);
                    }
                    framebuffer[static_cast<std::size_t>(j) * image_width + i]
                        = pixel_color * pixel_sample_scale;
                }
            }
        };
        
        std::vector<std::thread> pool;
        pool.reserve(thread_count);
        for (unsigned t = 0; t < thread_count; t++)
        {
            const int begin = static_cast<int>(t) * rows_per_thread;
            const int end   = std::min(begin + rows_per_thread, image_height);
            if (begin >= end) continue;   // 行已分完，不再起线程
            pool.emplace_back(worker, mix_seed(BASE_SEED + t), begin, end);
        }
        for (auto& th : pool)
        {
            th.join();
        }
        
        std::ofstream out("image.ppm", std::ios::binary);
        if (!out)
        {
            std::cerr << "Failed to open file\n"; return;
        }
        out << "P3\n" << image_width << ' ' << image_height << "\n255\n";
        for (int j = 0 ; j < image_height; j++)
        {
            for (int i = 0; i < image_width; i++)
            {
                write_color(out, framebuffer[static_cast<std::size_t>(j) * image_width + i]);
            }
        }
        
        const auto t_end = clock_type::now();

        const double elapsed_ms =
            std::chrono::duration<double, std::milli>(t_end - t_start).count();

        std::clog << "\nRender time: " << elapsed_ms << " ms ("
                  << elapsed_ms / 1000.0 << " s)\n";
    }

    private:
        int    image_height;   // Rendered image height
        double pixel_sample_scale; // Color scale factor for a sum of pixel samples
        point3 center;         // Camera center
        point3 pixel00_loc;    // Location of pixel 0, 0
        vec3   pixel_delta_u;  // Offset to pixel to the right
        vec3   pixel_delta_v;  // Offset to pixel below
        vec3   u,v,w;
        vec3 defocus_disk_u;
        vec3 defocus_disk_v;

        void initialize(){
            // Calculate the image height, and ensure that it's at least 1.
            image_height = int(image_width / aspect_ratio);
            image_height = (image_height < 1) ? 1 : image_height;

            pixel_sample_scale = 1.0 / sample_per_pixel;

            // camera
            center = lookfrom;
            // Determine viewport dimensions.
            // auto focal_length = (lookfrom - lookat).length();
            auto theta = degrees_to_radians(vfov);
            auto h = std::tan(theta/2);
            auto viewport_height = 2 * h * focus_dist;
            auto viewport_width = viewport_height * (double(image_width) / image_height);// 计算实际的viewport_width

            // Calculate the u,v,w unit basis vectors for the camera coordinate frame.
            w = unit_vector(lookfrom - lookat);
            u = unit_vector(cross(vup, w));
            v = cross(w, u);
            
            // Calculate the vectors across the horizontal and down the vertical viewport edges.计算沿视口水平边缘和垂直向下边缘的向量。
            auto viewport_u = viewport_width * u;
            auto viewport_v = viewport_height * -v;

            // Calculate the horizontal and vertical delta vectors from pixel to pixel.
            pixel_delta_u = viewport_u / image_width;
            pixel_delta_v = viewport_v / image_height;

            // Calculate the location of the upper left pixel.
            auto viewport_upper_left = center - (focus_dist * w) - viewport_u / 2 - viewport_v / 2;
            pixel00_loc = viewport_upper_left + 0.5 * (pixel_delta_u + pixel_delta_v); // 从视口左上角角点，向右下移半个像素步长。
            
            // Calculate the camera defocus disk basis vectors.
            auto defocus_radius = focus_dist * std::tan(degrees_to_radians(defocus_angle/2));
            defocus_disk_u = u * defocus_radius;
            defocus_disk_v = v * defocus_radius;
            
        }

        ray get_ray(int i, int j, rng_t& rng ) const {
            // Construct a camera ray originating from the defocus disk and directed at a randomly
            // sampled point around the pixel location i, j.
            vec3 offset = sample_square(rng);
            point3 pixel_sample = pixel00_loc + (i + offset.x()) * pixel_delta_u + (j + offset.y()) * pixel_delta_v;
            point3 ray_origin = (defocus_angle <= 0) ? center : defocus_disk_sample(rng);
            vec3 ray_direction = pixel_sample - ray_origin;
            return ray(ray_origin, ray_direction);

        }

        vec3 sample_square(rng_t& rng) const {
            // Returns the vector to a random point in the [-.5,-.5]-[+.5,+.5] unit square.
            return vec3(rng.next() - 0.5, rng.next() - 0.5, 0);
        }
    
        vec3 defocus_disk_sample(rng_t& rng) const{
            // Returns a random point in the camera defocus disk.
            auto p = random_in_unit_disk(rng);
            return center + (p[0] * defocus_disk_u) + (p[1] * defocus_disk_v);
        }

        color ray_color(const ray& r, int depth, const hittable& world, rng_t& rng) const {
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
                if(rec.mat->scatter(r, rec, rng, attenuation, scattered))
                {
                    return attenuation  * ray_color(scattered, depth - 1, world, rng);
                }
                return color(0,0,0);
            }

            vec3 unit_direction = unit_vector(r.direction());
            auto a = 0.5 * (unit_direction.y() + 1.0);
            return (1.0 -a) * color(1.0, 1.0, 1.0) + a * color(0.5, 0.7, 1.0);
        }


};