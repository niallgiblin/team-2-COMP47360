import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
} from "@mui/material";

export default function Login() {
  const { login, loading } = useAuth();
  const [formData, setFormData] = useState({
    usernameOrEmail: "",
    password: "",
  });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    // Clear error when user starts typing
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Basic validation
    if (!formData.usernameOrEmail.trim()) {
      setError("Please enter your username or email");
      return;
    }

    if (!formData.password) {
      setError("Please enter your password");
      return;
    }

    try {
      await login(formData.usernameOrEmail.trim(), formData.password);
    } catch (err) {
      setError(err.message || "Invalid login credentials");
    }
  };

  return (
    <Container maxWidth="sm">
      <Paper elevation={4} sx={{ mt: 8, p: 4, borderRadius: 2 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Log In
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 3 }}
        >
          <TextField
            label="Username or Email"
            name="usernameOrEmail"
            type="text"
            required
            fullWidth
            value={formData.usernameOrEmail}
            onChange={handleChange}
            disabled={loading}
            placeholder="Enter your username or email"
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            required
            fullWidth
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            placeholder="Enter your password"
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
            sx={{
              background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
              fontWeight: "bold",
              color: "#121212",
              "&:hover": {
                background: "linear-gradient(to right, #5F3AFF, #FF6EDB)",
              },
              "&:disabled": {
                background: "#ccc",
              },
            }}
          >
            {loading ? <CircularProgress size={24} /> : "Log In"}
          </Button>

          <Typography align="center" sx={{ mt: 2 }}>
            Don't have an account?{" "}
            <Link
              to="/signup"
              style={{ color: "#3ABEFF", textDecoration: "none" }}
            >
              Sign up here
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
