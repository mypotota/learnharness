/**
 * A minimal JNI host for the embedded Node.js runtime.
 *
 * nodejs-mobile ships Node as `libnode.so`; `node::Start` boots a fresh
 * isolate on the calling thread. We run it on its own pthread and redirect
 * stdout/stderr into logcat so startup failures are visible under the
 * `LH-NODE` tag.
 */

#include <jni.h>

#include <android/log.h>
#include <pthread.h>
#include <unistd.h>

#include <cstdint>
#include <string>
#include <vector>

#include "node.h"

#define LOG_TAG "LH-NODE"

namespace {

void* runNode(void* raw) {
	auto* args = static_cast<std::vector<std::string>*>(raw);
	std::vector<char*> argv;
	argv.reserve(args->size() + 1);
	for (auto& arg : *args) argv.push_back(const_cast<char*>(arg.c_str()));
	argv.push_back(nullptr);

	__android_log_print(ANDROID_LOG_INFO, LOG_TAG, "starting node (%s)", argv.size() > 1 ? argv[1] : "?");
	int code = node::Start(static_cast<int>(argv.size() - 1), argv.data());
	__android_log_print(ANDROID_LOG_INFO, LOG_TAG, "node exited with %d", code);
	delete args;
	return nullptr;
}

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_ai_learnharness_mobile_NodeRuntime_startNode(JNIEnv* env, jclass, jobjectArray args, jstring cwd) {
	const char* cwdChars = env->GetStringUTFChars(cwd, nullptr);
	if (cwdChars) {
		if (chdir(cwdChars) != 0) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "chdir failed");
		env->ReleaseStringUTFChars(cwd, cwdChars);
	}

	auto* list = new std::vector<std::string>();
	list->push_back("lh-node");
	jsize count = env->GetArrayLength(args);
	for (jsize i = 0; i < count; i++) {
		auto item = static_cast<jstring>(env->GetObjectArrayElement(args, i));
		const char* chars = env->GetStringUTFChars(item, nullptr);
		list->emplace_back(chars ? chars : "");
		if (chars) env->ReleaseStringUTFChars(item, chars);
		env->DeleteLocalRef(item);
	}

	pthread_t thread;
	pthread_create(&thread, nullptr, runNode, list);
	pthread_detach(thread);
}
