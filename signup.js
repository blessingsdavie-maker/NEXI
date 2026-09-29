const signupForm = document.getElementById("signupForm");

signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const full_name = document.getElementById("full_name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch("http://localhost:5000/api/signup", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name,
                email,
                password
            })
        });

        const data = await response.json();

        if (data.success) {
            alert("Account created successfully!");

            signupForm.reset();

            console.log("New user:", data.user);
        } else {
            alert(data.message);
        }

    } catch (error) {
        console.error("Signup error:", error);
        alert("Unable to connect to the Nexi server.");
    }
});