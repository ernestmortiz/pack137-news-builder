// Where Gradle finds the plugins this build script uses (the `kotlin-dsl` plugin and the Kotlin
// libraries it pulls in). Google's mirror of Maven Central comes first: Maven Central itself
// refused GitHub's runners with "429 Too Many Requests" three times on 2026-11-25. The Gradle
// Plugin Portal stays as the fallback, and is the only home of the plugin markers.
pluginManagement {
    repositories {
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        gradlePluginPortal()
    }
}
