#pragma once

#include <cassert>
#include <cmath>
#include <cstddef>
#include <ostream>

class vec3 {
  public:
    double e[3];

    constexpr vec3() : e{0,0,0} {}
    constexpr vec3(double e0, double e1, double e2) noexcept : e{e0, e1, e2} {}

    constexpr double x() const { return e[0]; }
    constexpr double y() const { return e[1]; }
    constexpr double z() const { return e[2]; }

    constexpr vec3 operator-() const { return vec3(-e[0], -e[1], -e[2]); }

    constexpr double operator[](std::size_t i) const {
        assert(i < 3);
        return e[i]; 
    }

    constexpr double& operator[](std::size_t i) {
        assert(i < 3);
        return e[i]; 
    }

    constexpr vec3& operator+=(const vec3& v) {
        e[0] += v.e[0];
        e[1] += v.e[1];
        e[2] += v.e[2];
        return *this;
    }

    constexpr vec3& operator-=(const vec3& v) {
        e[0] -= v.e[0];
        e[1] -= v.e[1];
        e[2] -= v.e[2];
        return *this;
    }

    constexpr vec3& operator*=(double t) {
        e[0] *= t;
        e[1] *= t;
        e[2] *= t;
        return *this;
    }

    constexpr vec3& operator/=(double t) {
        assert(t!= 0.0);
        return *this *= 1/t;
    }

    double length() const {
        return std::sqrt(length_squared());
    }

    constexpr double length_squared() const {
        return e[0]*e[0] + e[1]*e[1] + e[2]*e[2];
    }

    // 归一化前判断退化向量，避免除零产生 NaN 
    constexpr bool near_zero() const noexcept {
        constexpr double s = 1e-8;
        return (e[0] <s ) && (e[0] > -s)
        && (e[1] <s ) && (e[1] > -s)
        && (e[2] <s ) && (e[2] > -s);
    }

};

// point3 is just an alias for vec3, but useful for geometric clarity in the code.
using point3 = vec3;

// Vector Utility Functions

// 流可能抛异常，故不标 noexcept
inline std::ostream& operator<<(std::ostream& out, const vec3& v) {
    return out << v.e[0] << ' ' << v.e[1] << ' ' << v.e[2];
}

constexpr vec3 operator+(const vec3& u, const vec3& v) noexcept{
    return vec3(u.e[0] + v.e[0], u.e[1] + v.e[1], u.e[2] + v.e[2]);
}

constexpr vec3 operator-(const vec3& u, const vec3& v) noexcept {
    return vec3(u.e[0] - v.e[0], u.e[1] - v.e[1], u.e[2] - v.e[2]);
}

// Hadamard 积（分量乘），不是点积也不是叉积
constexpr vec3 operator*(const vec3& u, const vec3& v) noexcept {
    return vec3(u.e[0] * v.e[0], u.e[1] * v.e[1], u.e[2] * v.e[2]);
}

constexpr vec3 operator*(double t, const vec3& v) noexcept {
    return vec3(t*v.e[0], t*v.e[1], t*v.e[2]);
}

constexpr vec3 operator*(const vec3& v, double t) noexcept {
    return t * v;
}

constexpr vec3 operator/(const vec3& v, double t) noexcept {
    assert(t != 0.0);
    return (1/t) * v;
}

constexpr double dot(const vec3& u, const vec3& v) noexcept {
    return u.e[0] * v.e[0]
         + u.e[1] * v.e[1]
         + u.e[2] * v.e[2];
}

constexpr vec3 cross(const vec3& u, const vec3& v) noexcept {
    return vec3(u.e[1] * v.e[2] - u.e[2] * v.e[1],
                u.e[2] * v.e[0] - u.e[0] * v.e[2],
                u.e[0] * v.e[1] - u.e[1] * v.e[0]);
}

// 依赖 length()，故非 constexpr
inline vec3 unit_vector(const vec3& v) {
    assert(!v.near_zero());
    return v / v.length();
}

constexpr bool operator==(const vec3& u, const vec3&v) noexcept{
    return u.e[0] == v.e[0]
        && u.e[1] == v.e[1]
        && u.e[2] == v.e[2];
}

constexpr bool operator!=(const vec3& u, const vec3& v) noexcept{
    return !(u == v);
}