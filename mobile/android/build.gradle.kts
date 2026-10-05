plugins {
    id("com.android.library") version "8.11.1"
    id("org.jetbrains.kotlin.android") version "2.1.0"
}

android {
    namespace = "io.github.xlmc.danmu.gradient"
    compileSdk = 35
    defaultConfig { minSdk = 21 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions.unitTests.isIncludeAndroidResources = true
    sourceSets.getByName("test").resources.srcDir(layout.buildDirectory.dir("generated/contract"))
    testOptions.unitTests.all { test ->
        providers.gradleProperty("artifactDir").orNull?.let { path -> test.systemProperty("artifactDir", path) }
    }
}

val generateContract by tasks.registering(Exec::class) {
    workingDir(rootDir.resolve("../.."))
    commandLine("node", "scripts/android-contract.mjs", layout.buildDirectory.dir("generated/contract").get().asFile.absolutePath)
    inputs.files(rootDir.resolve("../../src/gradient-effect.js"), fileTree(rootDir.resolve("../../vendor/danmux")), rootDir.resolve("../../scripts/android-contract.mjs"))
    outputs.dir(layout.buildDirectory.dir("generated/contract"))
}
tasks.matching { it.name == "processDebugUnitTestJavaRes" || it.name == "processReleaseUnitTestJavaRes" }.configureEach {
    dependsOn(generateContract)
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.13")
}
