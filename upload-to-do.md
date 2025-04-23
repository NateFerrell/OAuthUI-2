# Uploading Code to Digital Ocean

## Option 1: Using Git

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. SSH into your Droplet and clone the repository:
   ```bash
   ssh root@YOUR_DROPLET_IP
   git clone https://github.com/yourusername/your-repo.git
   ```

## Option 2: Using SCP (Secure Copy)

Use SCP to directly copy files from your local machine to the Droplet:

```bash
# Copy the entire directory
scp -r /Users/nateferrell/Code\ VARO/Oauth root@YOUR_DROPLET_IP:/root/

# Or create a zip file and copy that
cd /Users/nateferrell/Code\ VARO/
zip -r oauth.zip Oauth
scp oauth.zip root@YOUR_DROPLET_IP:/root/
```

Then SSH in and unzip if needed:
```bash
ssh root@YOUR_DROPLET_IP
unzip oauth.zip
```

## Option 3: Using SFTP

Use an SFTP client like FileZilla or Cyberduck:
1. Connect to your Droplet using SFTP protocol
2. Host: YOUR_DROPLET_IP
3. Username: root
4. Password: your-password (or SSH key)
5. Port: 22
6. Drag and drop files to upload