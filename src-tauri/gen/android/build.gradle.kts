buildscript {
    repositories {
        google()
        // Google's mirror of Maven Central first; Maven Central refused CI with 429s (2026-11-25).
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.3.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

allprojects {
    repositories {
        google()
        // Google's mirror of Maven Central first; Maven Central refused CI with 429s (2026-11-25).
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

