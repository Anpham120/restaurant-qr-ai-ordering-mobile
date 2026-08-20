# Multi-stage: a fat JDK image builds, a slim JRE image ships. Khuôn này kế thừa từ
# `backend/Dockerfile` của bản .NET, tệp đó đã xoá ở #59.
#
# Bản Gradle do WRAPPER quyết (gradle/wrapper/gradle-wrapper.properties → 8.10.2), không phải do
# image. Trước đây CI gọi `gradle` trần nên dùng bản có sẵn trên runner GitHub; runner nhảy lên
# 9.7.0 và build đỏ trong khi image vẫn 8.10 — cùng một commit cho ra hai kết quả. Wrapper làm
# máy lập trình, image này và CI dùng chung đúng một bản.
FROM gradle:8.10-jdk21 AS build
WORKDIR /src

# Dependency descriptors first: this layer is cached unless the build files themselves change, so
# editing Java sources does not re-resolve the whole dependency graph on every rebuild.
COPY backend-java/gradlew ./
COPY backend-java/gradle ./gradle
COPY backend-java/build.gradle backend-java/settings.gradle ./
RUN ./gradlew --no-daemon dependencies --configuration runtimeClasspath > /dev/null 2>&1 || true

COPY backend-java/src ./src
RUN ./gradlew --no-daemon bootJar -x test

# JRE, not JDK: the compiler is build-time only, and shipping it would carry javac and the full tool
# chain into production for nothing.
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app

# curl is here for the same reason as in the .NET image: the compose healthcheck shells out to it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root, matching the .NET image's `USER app`. Created explicitly because eclipse-temurin has no
# unprivileged user of its own.
RUN groupadd --system spring && useradd --system --gid spring --create-home spring

COPY --from=build --chown=spring:spring /src/build/libs/*.jar /app/app.jar

ENV BACKEND_JAVA_PORT=8081
EXPOSE 8081

USER spring

# `exec` form so the JVM is PID 1 and receives SIGTERM directly — without it the shell swallows the
# signal and compose falls back to SIGKILL after the timeout, cutting off graceful shutdown.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
