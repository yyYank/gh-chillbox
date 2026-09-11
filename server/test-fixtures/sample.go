package user

type User struct {
	ID   string
	Name string
}

type UserRepository interface {
	FindByID(id string) (*User, error)
	Save(user *User) error
}

func NewUser(id, name string) *User {
	return &User{ID: id, Name: name}
}

func (u *User) UpdateName(name string) {
	u.Name = name
}

func helperFunc() int {
	return 42
}
