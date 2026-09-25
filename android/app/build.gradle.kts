import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.samito.cyedt"
    compileSdk = 36

    defaultConfig {
        applicationId = "fr.samito.cyedt"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "1.2.0"
    }

    // Clé de signature publique, commune à toutes les compilations : chaque nouvel APK
    // s'installe par-dessus le précédent (identifiants et cache conservés).
    signingConfigs {
        create("shared") {
            storeFile = file("cy-edt.keystore")
            storePassword = "cy-edt-public"
            keyAlias = "cy-edt"
            keyPassword = "cy-edt-public"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation("androidx.work:work-runtime:2.10.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")   // vraie implémentation (celle d'Android est un bouchon en test)
}
