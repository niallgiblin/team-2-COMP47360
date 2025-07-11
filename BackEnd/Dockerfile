# --- Build Stage ---
# Use a full JDK image to build the application.
# 'AS builder' names this stage so we can copy from it later.
FROM eclipse-temurin:17-jdk-jammy AS builder
WORKDIR /app

# Copy only the files needed for dependency resolution first.
COPY .mvn/ .mvn
COPY mvnw pom.xml ./

# Add executable permissions to the Maven wrapper. This is a crucial
# step to prevent build failures in environments where permissions are lost.
RUN chmod +x mvnw

# Download dependencies. This layer is only rebuilt if pom.xml changes.
# The --mount flag is a BuildKit feature to cache the Maven repository.
RUN --mount=type=cache,target=/root/.m2 ./mvnw dependency:go-offline

# Copy the application source code.
COPY src ./src

# Build the application into a JAR file. This is only re-run if source code changes.
RUN --mount=type=cache,target=/root/.m2 ./mvnw package -DskipTests

# --- Final Stage ---
# Use a lightweight, secure JRE-only image for the final application.
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Create a dedicated, non-root user for better security.
RUN addgroup --system --gid 1001 spring && \
    adduser --system --uid 1001 --ingroup spring spring

# Copy the built JAR from the 'builder' stage and set ownership at the same time.
COPY --from=builder --chown=spring:spring /app/target/*.jar app.jar

# Switch to the non-root user for added security.
USER spring

# Expose the port the application will run on and define the entrypoint.
EXPOSE 8080
ENTRYPOINT ["java", "-Djava.net.preferIPv4Stack=true", "--enable-preview", "-jar", "app.jar"]