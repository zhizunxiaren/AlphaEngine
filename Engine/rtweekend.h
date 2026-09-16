#pragma once

#include <cassert>
#include <iostream>
#include <iosfwd>
#include <fstream>
#include <memory>
#include <cstddef>

// C++ Std Usings

using std::make_shared;
using std::shared_ptr;

// Constants


const double pi = 3.1415926535897932385;

// Utility Functions

inline double degrees_to_radians(double degrees) {
    return degrees * pi / 180.0;
}

// Common Headers

#include "color.h"
#include "ray.h"
#include "vec3.h"
#include "interval.h"

