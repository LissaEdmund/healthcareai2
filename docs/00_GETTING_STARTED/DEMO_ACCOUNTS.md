# Synthetic demo accounts

The local UI provides two demo roles:

| Username | Default password | Permission in this slice |
|---|---|---|
| `nurse` | `nurse-demo` | Register synthetic patients, open encounters, record observations, and run the assistance workflow. |
| `practitioner` | `practitioner-demo` | Review pending alerts and approve or reject them. |

Passwords can be changed using `DEMO_NURSE_PASSWORD` and `DEMO_PRACTITIONER_PASSWORD` in `.env`. Credentials are deliberately simple for local demos; authentication is not production-grade.
