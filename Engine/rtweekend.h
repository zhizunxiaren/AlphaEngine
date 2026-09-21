#pragma once

#include <cassert>
#include <iostream>
#include <iosfwd>
#include <fstream>
#include <memory>
#include <cstddef>
#include <cstdlib>
#include <atomic>
#include <thread>
#include <vector>
#include <random>
#include <cstdint>
#include <algorithm>

// C++ Std Usings

using std::make_shared;
using std::shared_ptr;

// Constants


const double pi = 3.1415926535897932385;

// Utility Functions

inline double degrees_to_radians(double degrees) {
    return degrees * pi / 180.0;
}

// 每线程携带的随机数上下文
struct rng_t
{
    std::mt19937 engine;
    std::uniform_real_distribution<double> dist{0.0, 1.0};
    
    explicit rng_t(std::uint32_t seed) : engine(seed){}
    
    double next() {return dist(engine);} // [0,1)
    double next(double lo, double hi) // [lo, hi)
    {
        return lo + (hi - lo) * next();
    }
};

// 把线程序号这类相邻整数打散成互不相关的种子。
// 防御性措施：mt19937 的初始化本身已对种子做过充分打散，这里只是让
// 「种子 = 序号的纯函数」这件事显式化，代价是一次整数混合。
inline std::uint32_t mix_seed(std::uint32_t x)
{
    x += 0x9e3779b9u;
    x = (x^(x>>16)) * 0x21f0aaadu;
    x = (x^(x>>15)) * 0x735a2d97u;
    return x ^ (x >> 15);
}


// Common Headers

#include "color.h"
#include "ray.h"
#include "vec3.h"
#include "interval.h"
