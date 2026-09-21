#include "camera.h"

#include "hittable.h"
#include "hittable_list.h"
#include "sphere.h"
#include "material.h"


int main()
{
    hittable_list world;

    // auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
    // auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
    // auto material_left   = make_shared<dielectric>(1.50);
    // auto material_bubble = make_shared<dielectric>(1.00 / 1.50);
    // auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2), 1.0);
    //
    // world.add(make_shared<sphere>(point3( 0.0, -100.5, -1.0), 100.0, material_ground));
    // world.add(make_shared<sphere>(point3( 0.0,    0.0, -1.2),   0.5, material_center));
    // world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.5, material_left));
    // world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.4, material_bubble));
    // world.add(make_shared<sphere>(point3( 1.0,    0.0, -1.0),   0.5, material_right));

    // auto R = std::cos(pi/4);
    //
    // auto material_left  = make_shared<lambertian>(color(0,0,1));
    // auto material_right = make_shared<lambertian>(color(1,0,0));
    //
    // world.add(make_shared<sphere>(point3(-R, 0, -1), R, material_left));
    // world.add(make_shared<sphere>(point3( R, 0, -1), R, material_right));
    
    // 场景构建是单线程的，单独持有一个 rng。
    // 固定种子 → 每次运行得到同一个场景，便于对比渲染参数的改动。
    constexpr std::uint32_t SCENE_SEED = 5489;
    rng_t scene_rng(SCENE_SEED);
    
    auto ground_material = make_shared<lambertian>(color(0.5, 0.5, 0.5));
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, ground_material));
    
    for (int i = 0; i < 22; i++)
    {
        for (int j = 0; j < 22; j++)
        {
            auto choose_mat = scene_rng.next();
            point3 center(i + 0.9 * scene_rng.next(), 0.2, j + 0.9 * scene_rng.next());
            if ((center - point3(4, 0.2, 0)).length() > 0.9)
            {
                shared_ptr<material> sphere_material;
                
                if (choose_mat < 0.8 )
                {
                    // diffuse
                    auto albedo = vec3::random(scene_rng) * vec3::random(scene_rng);
                    sphere_material = make_shared<lambertian>(albedo);
                    world.add(make_shared<sphere>(center, 0.2, sphere_material));
                }else if (choose_mat < 0.95) {
                    // metal
                    auto albedo = vec3::random(scene_rng, 0.5, 1);
                    auto fuzz = scene_rng.next(0, 0.5);
                    sphere_material = make_shared<metal>(albedo, fuzz);
                    world.add(make_shared<sphere>(center, 0.2, sphere_material));
                } else {
                    // glass
                    sphere_material = make_shared<dielectric>(1.5);
                    world.add(make_shared<sphere>(center, 0.2, sphere_material));
                }
            }
        }
    }

    auto material1 = make_shared<dielectric>(1.5);
    world.add(make_shared<sphere>(point3(0, 1, 0), 1.0, material1));

    auto material2 = make_shared<lambertian>(color(0.4, 0.2, 0.1));
    world.add(make_shared<sphere>(point3(-4, 1, 0), 1.0, material2));

    auto material3 = make_shared<metal>(color(0.7, 0.6, 0.5), 0.0);
    world.add(make_shared<sphere>(point3(4, 1, 0), 1.0, material3));
    
    camera cam;
    cam.aspect_ratio = 16.0 / 9.0;
    cam.image_width  = 1200;
    cam.sample_per_pixel = 100;
    cam.max_depth = 50;
    cam.vfov = 20.0;
    cam.lookfrom = point3(13,2,3);
    cam.lookat   = point3(0,0, 0);
    cam.vup      = vec3(0,1,0);
    cam.defocus_angle = 0.6;
    cam.focus_dist = 10;
    cam.render(world);

}



