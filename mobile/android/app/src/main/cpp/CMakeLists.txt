cmake_minimum_required(VERSION 3.22.1)
project(lh_node CXX)

add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES
    IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so")

add_library(lh_node SHARED node-starter.cpp)
target_include_directories(lh_node PRIVATE "${CMAKE_SOURCE_DIR}/node_include")
target_link_libraries(lh_node node log)
