plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        create("pluginsForCoolKids") {
            id = "rust"
            implementationClass = "RustPlugin"
        }
    }
}

// Google's mirror of Maven Central first (see settings.gradle.kts), Maven Central as the fallback.
repositories {
    google()
    maven("https://maven-central.storage-download.googleapis.com/maven2/")
    mavenCentral()
}

dependencies {
    compileOnly(gradleApi())
    implementation("com.android.tools.build:gradle:9.3.1")
}

