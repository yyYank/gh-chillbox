package user

func Anonymize(u *User) {
	scanUser(u)
	redactFields(u)
}

func scanUser(u *User) {
	_ = u.Name
}

func redactFields(u *User) {
	u.Name = "***"
}
