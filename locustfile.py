from locust import HttpUser, task, between
import random

class UrbanGalaUser(HttpUser):
    wait_time = between(1, 2)

    def on_start(self):
        self.username = f"testuser{random.randint(10000,99999)}"
        self.password = "testpass"
        self.email = f"{self.username}@example.com"
        signup_resp = self.client.post("/api/auth/signup", json={
            "username": self.username,
            "email": self.email,
            "password": self.password,
            "firstName": "Test",
            "lastName": "User"
        })
        print("Signup response status:", signup_resp.status_code)
        print("Signup response text:", signup_resp.text)
        resp = self.client.post("/api/auth/login", json={
            "usernameOrEmail": self.username,
            "password": self.password
        })
        print("Login response status:", resp.status_code)
        print("Login response text:", resp.text)
        try:
            print("Login response JSON:", resp.json())
        except Exception as e:
            print("Failed to parse login response as JSON:", e)
        self.token = None
        try:
            data = resp.json()
            self.token = data.get("token") or data.get("jwt") or data.get("accessToken")
        except Exception:
            pass
        if not self.token:
            print("Failed to get JWT token from login response! Response was:", resp.text)
        self.headers = {"Authorization": f"Bearer {self.token}"}
        # Use a dummy location ID for now (e.g., 1)
        plan_payload = {
            "name": "Test Plan",
            "locationIds": [1]
        }
        plan_resp = self.client.post("/api/plans", json=plan_payload, headers=self.headers)
        try:
            self.plan_id = plan_resp.json().get("plan", {}).get("id", 1)
        except Exception:
            self.plan_id = 1

    @task(2)
    def vibe_search(self):
        self.client.post("/api/vibe/search", json={"vibeDescription": "museum"}, headers=self.headers)

    @task(2)
    def vibe_trending(self):
        self.client.get("/api/vibe/trending", headers=self.headers)

    @task(2)
    def vibe_map_data(self):
        self.client.get("/api/vibe/map-data", headers=self.headers)

    @task(2)
    def vibe_similar(self):
        # Use query parameters as required by the API
        # Use dummy locationId=1 for now
        self.client.post("/api/vibe/similar?locationId=1&limit=5", headers=self.headers)

    @task(1)
    def get_all_plans(self):
        self.client.get("/api/plans", headers=self.headers)

    @task(1)
    def get_specific_plan(self):
        self.client.get(f"/api/plans/{self.plan_id}", headers=self.headers)

    @task(1)
    def get_user_profile(self):
        self.client.get("/api/auth/me", headers=self.headers)
